// test/05-verification-record/verification-record-types.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull, Not } from 'typeorm';

import { AppModule } from '@src/app.module';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { TokenHelper } from '@core/common/token/token.helper';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * GraphQL 请求辅助函数
 */
async function postGql(app: INestApplication, query: string, variables: any, bearer?: string) {
  const http = request(app.getHttpServer() as App).post('/graphql');
  if (bearer) http.set('Authorization', `Bearer ${bearer}`);
  return await http.send({ query, variables });
}

/**
 * 获取访问令牌
 */
async function getAccessToken(
  app: INestApplication,
  loginName: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer() as App)
    .post('/graphql')
    .send({
      query: `
        mutation Login($input: AuthLoginInput!) {
          login(input: $input) {
            accessToken
          }
        }
      `,
      variables: {
        input: {
          loginName: loginName,
          loginPassword: password,
          type: 'PASSWORD',
          audience: 'DESKTOP',
        },
      },
    });

  if (response.status !== 200) {
    throw new Error(
      `登录请求失败，状态码: ${response.status}, 响应: ${JSON.stringify(response.body)}`,
    );
  }

  if (!response.body.data?.login?.accessToken) {
    throw new Error(`登录失败: ${JSON.stringify(response.body)}`);
  }

  return response.body.data.login.accessToken as string;
}

/**
 * 创建验证记录
 */
async function createVerificationRecord(
  app: INestApplication,
  type: string,
  payload: Record<string, unknown>,
  bearer: string,
  options: {
    targetAccountId?: number;
    subjectType?: string;
    subjectId?: number;
    expiresAt?: Date;
    returnToken?: boolean;
    token?: string;
  } = {},
) {
  const {
    targetAccountId,
    subjectType = 'LEARNER',
    subjectId,
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000),
    returnToken = true,
    token,
  } = options;

  const response = await postGql(
    app,
    `
      mutation CreateVerificationRecord($input: CreateVerificationRecordInput!) {
        createVerificationRecord(input: $input) {
          success
          data {
            id
            type
            status
            targetAccountId
            subjectType
            subjectId
            expiresAt
            payload
          }
          token
          message
        }
      }
    `,
    {
      input: {
        type,
        token,
        payload,
        expiresAt: expiresAt.toISOString(),
        targetAccountId,
        subjectType,
        subjectId,
        returnToken,
      },
    },
    bearer,
  );

  return response;
}

/**
 * 为指定 bearer 创建验证记录的便捷函数
 * 自动解析 targetBearer 对应的 accountId，避免手动传错 ID
 * @param app - NestJS 应用实例
 * @param type - 验证记录类型
 * @param payload - 验证记录载荷
 * @param issuerBearer - 创建者的 bearer token
 * @param targetBearer - 目标用户的 bearer token，为 null 时表示公开可消费
 * @param opts - 其他选项（不包含 targetAccountId）
 */
async function createForBearer(
  app: INestApplication,
  type: string,
  payload: Record<string, unknown>,
  issuerBearer: string,
  targetBearer: string | null,
  opts?: Omit<Parameters<typeof createVerificationRecord>[4], 'targetAccountId'>,
) {
  const targetAccountId = targetBearer ? getMyAccountId(app, targetBearer) : undefined;
  return createVerificationRecord(app, type, payload, issuerBearer, { ...opts, targetAccountId });
}

/**
 * 消费验证记录
 */
async function consumeVerificationRecord(app: INestApplication, token: string, bearer: string) {
  const response = await postGql(
    app,
    `
      mutation ConsumeVerificationRecord($input: ConsumeVerificationRecordInput!) {
        consumeVerificationRecord(input: $input) {
          success
          data {
            id
            status
            consumedAt
          }
          message
        }
      }
    `,
    { input: { token } },
    bearer,
  );

  return response;
}

/**
 * 获取当前 bearer token 对应的 accountId
 */
function getMyAccountId(app: INestApplication, bearer: string): number {
  // 从 app 中获取 TokenHelper 实例
  const tokenHelper = app.get(TokenHelper);

  // 解码 JWT token 获取 payload
  const payload = tokenHelper.decodeToken({ token: bearer });

  if (!payload || !payload.sub) {
    throw new Error(`无法从 JWT token 中获取 accountId: ${bearer.substring(0, 20)}...`);
  }

  return payload.sub;
}

/**
 * 查找验证记录
 */
async function findVerificationRecord(
  app: INestApplication,
  token: string,
  bearer: string,
  expectedType?: string,
  ignoreTargetRestriction?: boolean,
) {
  const input: any = {
    token,
  };
  if (expectedType) {
    input.expectedType = expectedType;
  }
  if (ignoreTargetRestriction !== undefined) {
    input.ignoreTargetRestriction = ignoreTargetRestriction;
  }

  return await postGql(
    app,
    `
      query FindVerificationRecord($input: FindVerificationRecordInput!) {
        findVerificationRecord(input: $input) {
          id
          type
          status
          expiresAt
          notBefore
          subjectType
          subjectId
        }
      }
    `,
    { input },
    bearer,
  );
}

describe('验证记录类型测试 E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试账户相关变量
  let managerAccessToken: string;
  let learnerAccessToken: string;
  let managerAccountId: number;
  let learnerAccountId: number;
  let learnerEntities: LearnerEntity[];
  let learnerSubject: LearnerEntity;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);

    // 清理并创建测试账户
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, createAccountUsecase });

    // 获取访问令牌
    managerAccessToken = await getAccessToken(
      app,
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
    learnerAccessToken = await getAccessToken(
      app,
      testAccountsConfig.learner.loginName,
      testAccountsConfig.learner.loginPassword,
    );

    // 通过 JWT 解码获取精确的 accountId，避免依赖实体查询顺序
    managerAccountId = getMyAccountId(app, managerAccessToken);
    learnerAccountId = getMyAccountId(app, learnerAccessToken);

    // 获取学员实体（仍需要用于 subjectId）
    const learnerRepository = dataSource.getRepository(LearnerEntity);
    learnerEntities = await learnerRepository.find({
      where: { accountId: Not(IsNull()) },
    });

    // 获取与 learnerAccountId 对应的学员实体，确保 subject 和 bearer 一一对应
    learnerSubject = learnerEntities.find((e) => e.accountId === learnerAccountId)!;
    if (!learnerSubject) {
      throw new Error(`无法找到与 learnerAccountId ${learnerAccountId} 对应的学员实体`);
    }

    console.log('Manager 账户 ID:', managerAccountId);
    console.log('Learner 账户 ID:', learnerAccountId);
    console.log('学员实体数量:', learnerEntities.length);
    console.log('对应的学员 Subject ID:', learnerSubject.id);
  });

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    await app.close();
  });

  describe('EMAIL_VERIFY_CODE 类型', () => {
    it('应该成功创建邮箱验证码类型的验证记录', async () => {
      const payload = {
        title: '邮箱验证码',
        email: 'test@example.com',
        verificationCode: '123456',
      };

      const response = await createVerificationRecord(
        app,
        'EMAIL_VERIFY_CODE',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('EMAIL_VERIFY_CODE 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('EMAIL_VERIFY_CODE');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();

      // 绑定性自检：确保 targetAccountId 与 learnerAccessToken 对应的账号一致
      expect(response.body.data.createVerificationRecord.data.targetAccountId).toBe(
        learnerAccountId,
      );
    });

    it('应该能够消费邮箱验证码', async () => {
      const payload = {
        title: '邮箱验证码消费测试',
        email: 'consume@example.com',
        verificationCode: '654321',
      };

      const createResponse = await createVerificationRecord(
        app,
        'EMAIL_VERIFY_CODE',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log(
        'EMAIL_VERIFY_CODE 消费测试创建响应:',
        JSON.stringify(createResponse.body, null, 2),
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('EMAIL_VERIFY_CODE 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('SMS_VERIFY_CODE 类型', () => {
    it('应该成功创建短信验证码类型的验证记录', async () => {
      const payload = {
        title: '短信验证码',
        phoneNumber: '+86 138 0013 8000',
        verificationCode: '888888',
      };

      const response = await createVerificationRecord(
        app,
        'SMS_VERIFY_CODE',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('SMS_VERIFY_CODE 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('SMS_VERIFY_CODE');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费短信验证码', async () => {
      const payload = {
        title: '短信验证码消费测试',
        phoneNumber: '+86 139 0013 9000',
        verificationCode: '999999',
      };

      const createResponse = await createVerificationRecord(
        app,
        'SMS_VERIFY_CODE',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log(
        'SMS_VERIFY_CODE 消费测试创建响应:',
        JSON.stringify(createResponse.body, null, 2),
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('SMS_VERIFY_CODE 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('PASSWORD_RESET 类型', () => {
    it('应该成功创建密码重置类型的验证记录', async () => {
      const payload = {
        title: '密码重置',
        resetUrl: 'https://example.com/reset-password',
        email: 'reset@example.com',
      };

      const response = await createVerificationRecord(
        app,
        'PASSWORD_RESET',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('PASSWORD_RESET 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('PASSWORD_RESET');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费密码重置验证记录', async () => {
      const payload = {
        title: '密码重置消费测试',
        resetUrl: 'https://example.com/reset-password-consume',
        email: 'reset-consume@example.com',
      };

      const createResponse = await createVerificationRecord(
        app,
        'PASSWORD_RESET',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('PASSWORD_RESET 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;

      // 使用 resetPassword mutation 而不是通用的 consumeVerificationRecord
      const newPassword = 'MyStrong2024!@#';
      const resetResponse = await postGql(
        app,
        `
          mutation ResetPassword($input: ResetPasswordInput!) {
            resetPassword(input: $input) {
              success
              message
              accountId
            }
          }
        `,
        {
          input: {
            token: token,
            newPassword: newPassword,
          },
        },
        // 密码重置是匿名操作，不需要认证令牌
      );

      console.log('PASSWORD_RESET 消费响应:', JSON.stringify(resetResponse.body, null, 2));

      expect(resetResponse.body.data.resetPassword.success).toBe(true);
      expect(resetResponse.body.data.resetPassword.accountId).toBe(learnerAccountId);
    });

    it('应该能够通过 findVerificationRecord 预读 PASSWORD_RESET 记录', async () => {
      const payload = {
        title: '密码重置预读测试',
        resetUrl: 'https://example.com/reset-password-preread',
        email: 'preread@example.com',
      };

      // 创建 PASSWORD_RESET 验证记录
      const createResponse = await createVerificationRecord(
        app,
        'PASSWORD_RESET',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('PASSWORD_RESET 预读测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();

      const token = createResponse.body.data.createVerificationRecord.token;

      // 使用 findVerificationRecord 预读验证记录（匿名调用，模拟前端密码重置页面）
      const findResponse = await postGql(
        app,
        `
          query FindVerificationRecord($input: FindVerificationRecordInput!) {
            findVerificationRecord(input: $input) {
              id
              type
              status
              expiresAt
              notBefore
              subjectType
              subjectId
            }
          }
        `,
        {
          input: {
            token: token,
            expectedType: 'PASSWORD_RESET',
          },
        },
        // 不传 bearer token，进行匿名调用
      );

      console.log('PASSWORD_RESET 预读响应:', JSON.stringify(findResponse.body, null, 2));

      // 验证预读结果
      console.log('预读响应:', JSON.stringify(findResponse.body, null, 2));

      expect(findResponse.body.data).toBeDefined();
      expect(findResponse.body.data.findVerificationRecord).toBeDefined();
      expect(findResponse.body.data.findVerificationRecord.type).toBe('PASSWORD_RESET');
      expect(findResponse.body.data.findVerificationRecord.status).toBe('ACTIVE');
      expect(findResponse.body.data.findVerificationRecord.subjectType).toBe('LEARNER');
      expect(findResponse.body.data.findVerificationRecord.subjectId).toBe(learnerSubject.id);
    });

    it('应该能够完成完整的密码重置流程：预读 + 重置密码', async () => {
      const payload = {
        title: '完整密码重置流程测试',
        resetUrl: 'https://example.com/reset-password-full',
        email: 'fullreset@example.com',
      };

      // 1. 创建 PASSWORD_RESET 验证记录
      const createResponse = await createVerificationRecord(
        app,
        'PASSWORD_RESET',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('完整流程创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();

      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 预读验证记录（匿名调用，模拟前端密码重置页面）
      const findResponse = await postGql(
        app,
        `
          query FindVerificationRecord($input: FindVerificationRecordInput!) {
            findVerificationRecord(input: $input) {
              id
              type
              status
              expiresAt
              notBefore
              subjectType
              subjectId
            }
          }
        `,
        {
          input: {
            token: token,
            expectedType: 'PASSWORD_RESET',
          },
        },
        // 不传 bearer token，进行匿名调用
      );

      console.log('完整流程预读响应:', JSON.stringify(findResponse.body, null, 2));

      expect(findResponse.body.data.findVerificationRecord.type).toBe('PASSWORD_RESET');
      expect(findResponse.body.data.findVerificationRecord.status).toBe('ACTIVE');

      // 3. 执行密码重置
      const newPassword = 'MyStrong2024!@#';
      const resetResponse = await postGql(
        app,
        `
          mutation ResetPassword($input: ResetPasswordInput!) {
            resetPassword(input: $input) {
              success
              message
              accountId
            }
          }
        `,
        {
          input: {
            token: token,
            newPassword: newPassword,
          },
        },
        // 密码重置现在是匿名操作，不需要认证令牌
      );

      console.log('密码重置响应:', JSON.stringify(resetResponse.body, null, 2));

      // 验证密码重置结果
      expect(resetResponse.body.data).toBeDefined();
      expect(resetResponse.body.data.resetPassword).toBeDefined();

      // 如果重置失败，输出错误信息
      if (!resetResponse.body.data.resetPassword.success) {
        console.log('密码重置失败原因:', resetResponse.body.data.resetPassword.message);
        console.log('完整的错误响应:', JSON.stringify(resetResponse.body, null, 2));
      }

      // 如果有 GraphQL 错误，也输出
      if (resetResponse.body.errors) {
        console.log('GraphQL 错误:', JSON.stringify(resetResponse.body.errors, null, 2));
      }

      expect(resetResponse.body.data.resetPassword.success).toBe(true);
      expect(resetResponse.body.data.resetPassword.accountId).toBe(learnerAccountId);

      // 4. 验证用户能够使用新密码登录
      const loginResponse = await postGql(
        app,
        `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
              accountId
            }
          }
        `,
        {
          input: {
            loginName: testAccountsConfig.learner.loginName,
            loginPassword: newPassword,
            type: 'PASSWORD',
            audience: 'DESKTOP',
          },
        },
      );

      console.log('新密码登录响应:', JSON.stringify(loginResponse.body, null, 2));

      // 验证新密码登录成功
      expect(loginResponse.body.data).toBeDefined();
      expect(loginResponse.body.data.login).toBeDefined();
      expect(loginResponse.body.data.login.accessToken).toBeDefined();
      expect(loginResponse.body.data.login.accountId).toBe(learnerAccountId);

      // 5. 验证旧密码不能再使用
      const oldPasswordLoginResponse = await postGql(
        app,
        `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              accessToken
              accountId
            }
          }
        `,
        {
          input: {
            loginName: testAccountsConfig.learner.loginName,
            loginPassword: testAccountsConfig.learner.loginPassword, // 旧密码
            type: 'PASSWORD',
            audience: 'DESKTOP',
          },
        },
      );

      console.log('旧密码登录响应:', JSON.stringify(oldPasswordLoginResponse.body, null, 2));

      // 验证旧密码登录失败
      expect(oldPasswordLoginResponse.body.errors).toBeDefined();
      expect(oldPasswordLoginResponse.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('MAGIC_LINK 类型', () => {
    it('应该成功创建魔法链接类型的验证记录', async () => {
      const payload = {
        title: '魔法链接',
        magicUrl: 'https://example.com/magic-login',
        email: 'magic@example.com',
      };

      const response = await createVerificationRecord(
        app,
        'MAGIC_LINK',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('MAGIC_LINK 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('MAGIC_LINK');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费魔法链接验证记录', async () => {
      const payload = {
        title: '魔法链接消费测试',
        magicUrl: 'https://example.com/magic-login-consume',
        email: 'magic-consume@example.com',
      };

      const createResponse = await createVerificationRecord(
        app,
        'MAGIC_LINK',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('MAGIC_LINK 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('MAGIC_LINK 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('WEAPP_BIND 类型', () => {
    it('应该成功创建微信小程序绑定类型的验证记录', async () => {
      const payload = {
        title: '微信小程序绑定',
        openId: 'wx_openid_123456',
        unionId: 'wx_unionid_789012',
      };

      const response = await createVerificationRecord(
        app,
        'WEAPP_BIND',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
        },
      );

      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('WEAPP_BIND');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
    });

    it('应该能够消费微信小程序绑定验证记录', async () => {
      const payload = {
        title: '微信小程序绑定消费测试',
        openId: 'wx_openid_consume_123',
        unionId: 'wx_unionid_consume_456',
      };

      const createResponse = await createVerificationRecord(
        app,
        'WEAPP_BIND',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
        },
      );

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('EMAIL_VERIFY_LINK 类型', () => {
    it('应该成功创建邮箱验证链接类型的验证记录', async () => {
      const payload = {
        title: '邮箱验证链接',
        verifyUrl: 'https://example.com/verify-email',
        email: 'verify@example.com',
      };

      const response = await createVerificationRecord(
        app,
        'EMAIL_VERIFY_LINK',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('EMAIL_VERIFY_LINK 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('EMAIL_VERIFY_LINK');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费邮箱验证链接验证记录', async () => {
      const payload = {
        title: '邮箱验证链接消费测试',
        verifyUrl: 'https://example.com/verify-email-consume',
        email: 'verify-consume@example.com',
      };

      const createResponse = await createVerificationRecord(
        app,
        'EMAIL_VERIFY_LINK',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log(
        'EMAIL_VERIFY_LINK 消费测试创建响应:',
        JSON.stringify(createResponse.body, null, 2),
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('EMAIL_VERIFY_LINK 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('类型过滤测试', () => {
    it('应该能够通过 expectedType 正确过滤验证记录', async () => {
      // 创建一个 EMAIL_VERIFY_CODE 类型的验证记录
      const payload = {
        title: '类型过滤测试',
        email: 'filter@example.com',
        verificationCode: '111111',
      };

      const createResponse = await createVerificationRecord(
        app,
        'EMAIL_VERIFY_CODE',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
        },
      );

      // 检查创建是否成功
      if (createResponse.body.errors) {
        console.error('创建验证记录时的 GraphQL 错误:', createResponse.body.errors);
        throw new Error(`创建验证记录失败: ${JSON.stringify(createResponse.body.errors)}`);
      }

      if (!createResponse.body.data.createVerificationRecord) {
        throw new Error('创建验证记录失败：返回数据为空');
      }

      const token = createResponse.body.data.createVerificationRecord.token;

      // 用正确的类型查询，应该能找到
      const correctTypeResponse = await findVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'EMAIL_VERIFY_CODE',
        true, // 忽略 target 限制，因为这是测试用例
      );

      expect(correctTypeResponse.body.data.findVerificationRecord).not.toBeNull();
      expect(correctTypeResponse.body.data.findVerificationRecord.type).toBe('EMAIL_VERIFY_CODE');

      // 用错误的类型查询，应该返回 null
      const wrongTypeResponse = await findVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'SMS_VERIFY_CODE',
        true, // 忽略 target 限制，但类型不匹配仍应返回 null
      );
      expect(wrongTypeResponse.body.data.findVerificationRecord).toBeNull();
    });
  });

  describe('数据库验证', () => {
    it('应该在数据库中正确存储各种类型的验证记录', async () => {
      const verificationRecordRepository = dataSource.getRepository(VerificationRecordEntity);

      // 创建不同类型的验证记录
      const testCases = [
        {
          type: 'EMAIL_VERIFY_CODE',
          payload: { title: '数据库测试', verificationCode: '123456' },
        },
        {
          type: 'SMS_VERIFY_CODE',
          payload: { title: '数据库测试', verificationCode: '654321' },
        },
        {
          type: 'PASSWORD_RESET',
          payload: { title: '数据库测试', resetUrl: 'https://example.com/reset' },
        },
      ];

      const createdRecords = [];

      for (const testCase of testCases) {
        const response = await createVerificationRecord(
          app,
          testCase.type,
          testCase.payload,
          managerAccessToken,
          {
            targetAccountId: learnerAccountId,
          },
        );

        expect(response.body.data.createVerificationRecord.success).toBe(true);
        createdRecords.push({
          id: parseInt(response.body.data.createVerificationRecord.data.id),
          type: testCase.type,
          payload: testCase.payload,
        });
      }

      // 验证数据库中的记录
      for (const record of createdRecords) {
        const dbRecord = await verificationRecordRepository.findOne({
          where: { id: record.id },
        });

        expect(dbRecord).toBeDefined();
        expect(dbRecord!.type).toBe(record.type);
        expect(dbRecord!.status).toBe('ACTIVE');
        expect(dbRecord!.payload).toEqual(record.payload);
        expect(dbRecord!.targetAccountId).toBe(learnerAccountId);
      }
    });
  });

  describe('跨账号访问控制测试', () => {
    it('应该阻止跨账号消费验证记录', async () => {
      const payload = {
        title: '跨账号消费测试',
        email: 'cross-account@example.com',
        verificationCode: '999999',
      };

      // 使用 createForBearer 为 manager 创建验证记录
      const createResponse = await createForBearer(
        app,
        'EMAIL_VERIFY_CODE',
        payload,
        managerAccessToken,
        managerAccessToken, // 目标是 manager 自己
        {
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);

      // 绑定性自检：确保创建的记录 targetAccountId 是 manager 的账号
      expect(createResponse.body.data.createVerificationRecord.data.targetAccountId).toBe(
        managerAccountId,
      );

      const token = createResponse.body.data.createVerificationRecord.token;

      // 尝试用 learner 的 token 消费 manager 的验证记录，应该失败
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      // 增强的容错性断言：兼容两种错误处理路径
      if (consumeResponse.body.errors) {
        // 路径1：GraphQL 错误
        console.log('GraphQL 错误:', consumeResponse.body.errors);
        expect(consumeResponse.body.errors.length).toBeGreaterThan(0);
        const errorMessage = consumeResponse.body.errors[0].message;
        expect(errorMessage).toContain('您无权使用此验证码');
      } else if (consumeResponse.body.data?.consumeVerificationRecord) {
        // 路径2：业务逻辑错误 (success=false)
        expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(false);
        expect(consumeResponse.body.data.consumeVerificationRecord.message).toContain(
          '您无权使用此验证码',
        );
      } else {
        // 意外情况：既没有 GraphQL 错误也没有正常的响应数据
        throw new Error(`意外的响应结构: ${JSON.stringify(consumeResponse.body, null, 2)}`);
      }
    });
  });

  describe('公开票据测试', () => {
    let publicToken: string;

    it('应该能够创建公开票据（任意登录用户可消费）', async () => {
      const payload = {
        title: '公开验证码',
        description: '任意登录用户都可以消费的验证码',
        code: 'PUBLIC123',
      };

      // 使用 createForBearer 创建公开票据，targetBearer 为 null
      const createResponse = await createForBearer(
        app,
        'EMAIL_VERIFY_CODE',
        payload,
        managerAccessToken,
        null, // targetBearer 为 null 表示公开票据
        {
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('公开票据创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.data.targetAccountId).toBeNull();
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();

      publicToken = createResponse.body.data.createVerificationRecord.token;
    });

    it('应该允许任意登录用户消费公开票据', async () => {
      // 使用 learner 的 token 消费公开票据，应该成功
      const consumeResponse = await consumeVerificationRecord(app, publicToken, learnerAccessToken);

      console.log('公开票据消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
      expect(consumeResponse.body.data.consumeVerificationRecord.data.consumedAt).toBeDefined();
    });

    it('应该拒绝重复消费已使用的公开票据', async () => {
      // 尝试再次消费同一个 token，应该失败
      const secondConsumeResponse = await consumeVerificationRecord(
        app,
        publicToken,
        learnerAccessToken,
      );

      console.log('重复消费公开票据响应:', JSON.stringify(secondConsumeResponse.body, null, 2));

      expect(secondConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);

      // 检查错误消息包含已使用相关的提示
      const message = secondConsumeResponse.body.data.consumeVerificationRecord.message;
      expect(
        message.includes('已被使用') ||
          message.includes('已失效') ||
          message.includes('CONSUMED') ||
          message.includes('不可重复使用'),
      ).toBe(true);
    });

    it('应该允许其他用户消费不同的公开票据', async () => {
      const payload = {
        title: '另一个公开验证码',
        description: '测试其他用户也能消费公开票据',
        code: 'PUBLIC456',
      };

      // 创建另一个公开票据
      const createResponse = await createForBearer(
        app,
        'SMS_VERIFY_CODE',
        payload,
        managerAccessToken,
        null, // 公开票据
        {
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const anotherPublicToken = createResponse.body.data.createVerificationRecord.token;

      // 使用 manager 的 token 消费公开票据，应该也能成功
      const consumeResponse = await consumeVerificationRecord(
        app,
        anotherPublicToken,
        managerAccessToken,
      );

      console.log('Manager 消费公开票据响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });
});
