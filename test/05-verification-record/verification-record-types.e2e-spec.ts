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
 * 查找验证记录
 */
async function findVerificationRecord(app: INestApplication, token: string, expectedType?: string) {
  const input: any = {
    token,
    ignoreTargetRestriction: true, // 忽略目标账号限制，允许查询有目标账号的记录
  };
  if (expectedType) {
    input.expectedType = expectedType;
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
  );
}

describe('验证记录类型测试 E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  // 测试账户相关变量
  let managerAccessToken: string;
  let learnerAccessToken: string;
  let learnerAccountIds: number[];
  let learnerEntities: LearnerEntity[];

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

    // 获取学员实体
    const learnerRepository = dataSource.getRepository(LearnerEntity);
    learnerEntities = await learnerRepository.find({
      where: { accountId: Not(IsNull()) },
    });

    learnerAccountIds = learnerEntities
      .filter((entity) => entity.accountId !== null)
      .map((entity) => entity.accountId!);

    console.log('学员账户 IDs:', learnerAccountIds);
    console.log('学员实体数量:', learnerEntities.length);
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
        },
      );

      console.log('PASSWORD_RESET 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('PASSWORD_RESET 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
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
          targetAccountId: learnerAccountIds[0],
        },
      );

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('INVITE_COACH 类型', () => {
    it('应该成功创建邀请教练类型的验证记录', async () => {
      const payload = {
        title: '邀请教练',
        inviteUrl: 'https://example.com/invite-coach',
        email: 'coach@example.com',
        coachName: '张教练',
      };

      const response = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      console.log('INVITE_COACH 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('INVITE_COACH');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费邀请教练验证记录', async () => {
      const payload = {
        title: '邀请教练消费测试',
        inviteUrl: 'https://example.com/invite-coach-consume',
        email: 'coach-consume@example.com',
        coachName: '李教练',
      };

      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      console.log('INVITE_COACH 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('INVITE_COACH 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('INVITE_MANAGER 类型', () => {
    it('应该成功创建邀请管理员类型的验证记录', async () => {
      const payload = {
        title: '邀请管理员',
        inviteUrl: 'https://example.com/invite-manager',
        email: 'manager@example.com',
        managerName: '王管理员',
      };

      const response = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      console.log('INVITE_MANAGER 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('INVITE_MANAGER');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费邀请管理员验证记录', async () => {
      const payload = {
        title: '邀请管理员消费测试',
        inviteUrl: 'https://example.com/invite-manager-consume',
        email: 'manager-consume@example.com',
        managerName: '赵管理员',
      };

      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      console.log('INVITE_MANAGER 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('INVITE_MANAGER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });

  describe('INVITE_LEARNER 类型', () => {
    it('应该成功创建邀请学员类型的验证记录', async () => {
      const payload = {
        title: '邀请学员',
        inviteUrl: 'https://example.com/invite-learner',
        email: 'learner@example.com',
        learnerName: '小明',
      };

      const response = await createVerificationRecord(
        app,
        'INVITE_LEARNER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
        },
      );

      console.log('INVITE_LEARNER 创建响应:', JSON.stringify(response.body, null, 2));

      // 检查 GraphQL 错误
      if (response.body.errors) {
        console.error('GraphQL errors:', response.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);
      }

      expect(response.body.data).toBeDefined();
      expect(response.body.data.createVerificationRecord).toBeDefined();
      expect(response.body.data.createVerificationRecord.success).toBe(true);
      expect(response.body.data.createVerificationRecord.data.type).toBe('INVITE_LEARNER');
      expect(response.body.data.createVerificationRecord.data.payload).toEqual(payload);
      expect(response.body.data.createVerificationRecord.token).toBeDefined();
      expect(response.body.data.createVerificationRecord.token).not.toBeNull();
    });

    it('应该能够消费邀请学员验证记录', async () => {
      const payload = {
        title: '邀请学员消费测试',
        inviteUrl: 'https://example.com/invite-learner-consume',
        email: 'learner-consume@example.com',
        learnerName: '小红',
      };

      const createResponse = await createVerificationRecord(
        app,
        'INVITE_LEARNER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
        },
      );

      console.log('INVITE_LEARNER 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('INVITE_LEARNER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
          subjectType: 'LEARNER',
          subjectId: learnerEntities[0].id,
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
          targetAccountId: learnerAccountIds[0],
        },
      );

      const token = createResponse.body.data.createVerificationRecord.token;

      // 用正确的类型查询，应该能找到
      const correctTypeResponse = await findVerificationRecord(app, token, 'EMAIL_VERIFY_CODE');
      expect(correctTypeResponse.body.data.findVerificationRecord).not.toBeNull();
      expect(correctTypeResponse.body.data.findVerificationRecord.type).toBe('EMAIL_VERIFY_CODE');

      // 用错误的类型查询，应该返回 null
      const wrongTypeResponse = await findVerificationRecord(app, token, 'SMS_VERIFY_CODE');
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
            targetAccountId: learnerAccountIds[0],
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
        expect(dbRecord!.targetAccountId).toBe(learnerAccountIds[0]);
      }
    });
  });
});
