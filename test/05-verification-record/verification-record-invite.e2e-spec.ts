// test/05-verification-record/verification-record-invite.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { postGql as postGqlUtils } from '../utils/e2e-graphql-utils';

import { TokenHelper } from '@core/common/token/token.helper';
import { AppModule } from '@src/app.module';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { WeAppProvider } from '@src/modules/third-party-auth/providers/weapp.provider';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * GraphQL 请求辅助函数
 */
async function postGql(app: INestApplication, query: string, variables: unknown, bearer?: string) {
  return await postGqlUtils({ app, query, variables, token: bearer });
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
async function consumeVerificationRecord(
  app: INestApplication,
  token: string,
  bearer: string,
  expectedType?: string,
) {
  const response = await postGql(
    app,
    `
      mutation ConsumeVerificationRecord($input: ConsumeVerificationRecordInput!) {
        consumeVerificationRecord(input: $input) {
          success
          data {
            id
            type
            status
            payload
            consumedAt
          }
        }
      }
    `,
    { input: { token, expectedType } },
    bearer,
  );

  return response;
}

/**
 * 获取当前账户 ID
 */
function getMyAccountId(app: INestApplication, bearer: string): number {
  const tokenHelper = app.get(TokenHelper);
  const payload = tokenHelper.decodeToken({ token: bearer });
  if (!payload || !payload.sub) {
    throw new Error('无法从 token 中获取账户 ID');
  }
  return parseInt(String(payload.sub), 10);
}

describe('05-VerificationRecord 邀请与 WeApp 二维码 E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  let managerAccessToken: string;
  let learnerAccessToken: string;
  let learnerAccountId: number;
  let learnerSubject: LearnerEntity;

  beforeAll(async () => {
    // 初始化 GraphQL Schema（确保 VerificationRecordStatus 等枚举被正确注册）
    const schemaResult = initGraphQLSchema();
    console.log(`✅ GraphQL Schema 初始化: ${schemaResult.message}`);

    // 覆盖 WeAppProvider，避免外网请求并便于断言 scene 传递
    const mockWeAppProvider: Pick<WeAppProvider, 'getAccessToken' | 'createWxaCodeUnlimit'> = {
      getAccessToken: jest.fn(() => Promise.resolve('mock-access-token')),
      createWxaCodeUnlimit: jest.fn(
        (params: {
          accessToken: string;
          scene: string;
          page?: string;
          width?: number;
          checkPath?: boolean;
          envVersion?: 'develop' | 'trial' | 'release';
          isHyaline?: boolean;
        }): Promise<{ buffer: Buffer; contentType: string }> => {
          const payload = [
            params.scene,
            params.page ?? '',
            String(params.width ?? ''),
            String(params.checkPath ?? ''),
            params.envVersion ?? '',
            String(params.isHyaline ?? ''),
          ].join('|');
          const buf = Buffer.from(`PNG:${payload}`);
          return Promise.resolve({ buffer: buf, contentType: 'image/png' });
        },
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WeAppProvider)
      .useValue(mockWeAppProvider)
      .compile();

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

    // 获取学员账户 ID 和实体
    learnerAccountId = getMyAccountId(app, learnerAccessToken);
    const learnerRepository = dataSource.getRepository(LearnerEntity);
    const foundLearner = await learnerRepository.findOne({
      where: { accountId: learnerAccountId },
    });

    if (!foundLearner) {
      throw new Error('找不到学员实体');
    }
    learnerSubject = foundLearner;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('邀请用例：INVITE_COACH', () => {
    beforeEach(async () => {
      // 每个测试开始前清理 Coach 数据
      const coachRepository = dataSource.getRepository(CoachEntity);
      const existingCoach = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (existingCoach) {
        await coachRepository.remove(existingCoach);
      }
    });

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
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

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
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_COACH',
      );

      // 检查是否有 GraphQL 错误
      if (consumeResponse.body.errors) {
        console.error('GraphQL errors:', consumeResponse.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(consumeResponse.body.errors)}`);
      }

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');

      // 验证事务一致性：所有操作都应该成功完成
      // 验证 Coach 身份已创建
      const coachAfterConsume = await dataSource.getRepository(CoachEntity).findOne({
        where: { accountId: learnerAccountId },
      });

      expect(coachAfterConsume).toBeDefined();
      expect(coachAfterConsume).not.toBeNull();
      expect(coachAfterConsume?.deactivatedAt).toBeNull();

      // 清理测试数据
      if (coachAfterConsume) {
        await dataSource.getRepository(CoachEntity).remove(coachAfterConsume);
      }
    });

    it('应该验证幂等性：重复消费同一个 token 应该失败', async () => {
      const payload = {
        title: '幂等性测试',
        inviteUrl: 'https://example.com/invite-coach-idempotent',
        email: 'coach-idempotent@example.com',
        coachName: '幂等性测试教练',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 第一次消费应该成功
      const firstConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_COACH',
      );
      expect(firstConsumeResponse.body.data.consumeVerificationRecord.success).toBe(true);

      // 3. 第二次消费同一个 token 应该失败
      const secondConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_COACH',
      );
      expect(secondConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);

      // 检查错误信息是否存在
      if (secondConsumeResponse.body.data.consumeVerificationRecord.message) {
        expect(secondConsumeResponse.body.data.consumeVerificationRecord.message).toContain(
          '已被使用或已失效',
        );
      }

      // 清理测试数据
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachAfterTest = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (coachAfterTest) {
        await coachRepository.remove(coachAfterTest);
      }
    });

    it('应该验证已存在 Coach 身份的处理：重新激活而不是重复创建', async () => {
      const coachRepository = dataSource.getRepository(CoachEntity);

      // 1. 先创建一个已停用的 Coach 身份
      const existingCoach = coachRepository.create({
        accountId: learnerAccountId,
        name: '已存在的教练',
        level: 1,
        description: '已停用的教练',
        specialty: '篮球',
        deactivatedAt: new Date(), // 设置为已停用
        remark: '测试用已停用教练',
        createdBy: null,
        updatedBy: null,
      });
      await coachRepository.save(existingCoach);

      const payload = {
        title: '重新激活测试',
        inviteUrl: 'https://example.com/invite-coach-reactivate',
        email: 'coach-reactivate@example.com',
        coachName: '重新激活的教练',
        coachLevel: 3,
        description: '重新激活的教练描述',
      };

      // 2. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 3. 消费验证记录
      const consumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_COACH',
      );
      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);

      // 4. 验证 Coach 身份被重新激活而不是重复创建
      const coachAfterReactivate = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });

      expect(coachAfterReactivate).toBeDefined();
      expect(coachAfterReactivate?.id).toBe(existingCoach.id); // 应该是同一个实体
      expect(coachAfterReactivate?.deactivatedAt).toBeNull(); // 应该被重新激活
      expect(coachAfterReactivate?.name).toBe('已存在的教练'); // 名称不应该被更新

      // 5. 清理测试数据
      await coachRepository.remove(coachAfterReactivate!);
    });

    it('应该验证并发消费的原子性：多个并发请求只有一个成功', async () => {
      const payload = {
        title: '并发消费测试',
        inviteUrl: 'https://example.com/invite-coach-concurrent',
        email: 'coach-concurrent@example.com',
        coachName: '并发测试教练',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 并发发起多个消费请求
      const concurrentPromises = Array.from({ length: 3 }, () =>
        consumeVerificationRecord(app, token, learnerAccessToken, 'INVITE_COACH'),
      );

      const results = await Promise.allSettled(concurrentPromises);

      // 3. 验证只有一个请求成功
      const successfulResults = results.filter(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.body.data.consumeVerificationRecord.success === true,
      );

      const failedResults = results.filter(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.body.data.consumeVerificationRecord.success === false,
      );

      expect(successfulResults).toHaveLength(1);
      expect(failedResults.length).toBeGreaterThanOrEqual(2);

      // 4. 验证数据库中只创建了一个 Coach 记录
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachCount = await coachRepository.count({
        where: { accountId: learnerAccountId },
      });
      expect(coachCount).toBe(1);

      // 5. 清理测试数据
      const coach = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (coach) {
        await coachRepository.remove(coach);
      }
    });

    it('应该验证匿名用户消费安全性：未登录用户不能消费验证记录', async () => {
      const payload = {
        title: '匿名消费安全测试',
        inviteUrl: 'https://example.com/invite-coach-anonymous',
        email: 'coach-anonymous@example.com',
        coachName: '匿名测试教练',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 尝试匿名消费（不提供 Bearer token）
      const anonymousConsumeResponse = await request(app.getHttpServer() as App)
        .post('/graphql')
        .send({
          query: `
            mutation ConsumeVerificationRecord($input: ConsumeVerificationRecordInput!) {
              consumeVerificationRecord(input: $input) {
                success
                message
                data {
                  id
                  status
                }
              }
            }
          `,
          variables: {
            input: {
              token,
              expectedType: 'INVITE_COACH',
            },
          },
        });

      // 3. 验证匿名消费应该失败
      expect(anonymousConsumeResponse.status).toBe(200);
      if (anonymousConsumeResponse.body.errors) {
        // 如果有 GraphQL 错误，应该是认证相关的错误
        expect(anonymousConsumeResponse.body.errors[0].extensions.errorCode).toMatch(
          /UNAUTHENTICATED|UNAUTHORIZED|AUTHENTICATION_REQUIRED|JWT_AUTHENTICATION_FAILED/,
        );
      } else {
        // 如果没有 GraphQL 错误，业务逻辑应该返回失败
        expect(anonymousConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);
      }

      // 4. 验证数据库中没有创建 Coach 记录
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachAfterAnonymousConsume = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      expect(coachAfterAnonymousConsume).toBeNull();
    });

    it('应该验证错误用户消费安全性：非目标用户不能消费验证记录', async () => {
      const payload = {
        title: '错误用户消费安全测试',
        inviteUrl: 'https://example.com/invite-coach-wrong-user',
        email: 'coach-wrong-user@example.com',
        coachName: '错误用户测试教练',
      };

      // 1. 创建针对 learnerAccountId 的验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_COACH',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 尝试用 Manager 账号消费（而不是目标 Learner 账号）
      const wrongUserConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        managerAccessToken, // 使用错误的用户 token
        'INVITE_COACH',
      );

      // 3. 验证错误用户消费应该失败
      expect(wrongUserConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);

      // 检查错误信息
      if (wrongUserConsumeResponse.body.data.consumeVerificationRecord.message) {
        expect(wrongUserConsumeResponse.body.data.consumeVerificationRecord.message).toMatch(
          /权限|授权|目标|用户/,
        );
      }

      // 4. 验证数据库中没有创建 Coach 记录
      const coachRepository = dataSource.getRepository(CoachEntity);
      const coachAfterWrongUserConsume = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      expect(coachAfterWrongUserConsume).toBeNull();
    });
  });

  describe('邀请用例：INVITE_MANAGER', () => {
    beforeEach(async () => {
      // 每个测试开始前清理 Manager 数据
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const existingManager = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (existingManager) {
        await managerRepository.remove(existingManager);
      }
    });

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
          targetAccountId: learnerAccountId,
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
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      console.log('INVITE_MANAGER 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_MANAGER',
      );

      // 检查是否有 GraphQL 错误
      if (consumeResponse.body.errors) {
        console.error('GraphQL errors:', consumeResponse.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(consumeResponse.body.errors)}`);
      }

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');

      // 验证事务一致性：所有操作都应该成功完成
      // 验证 Manager 身份已创建
      const managerAfterConsume = await dataSource.getRepository(ManagerEntity).findOne({
        where: { accountId: learnerAccountId },
      });

      expect(managerAfterConsume).toBeDefined();
      expect(managerAfterConsume).not.toBeNull();
      expect(managerAfterConsume?.deactivatedAt).toBeNull();

      // 清理测试数据
      if (managerAfterConsume) {
        await dataSource.getRepository(ManagerEntity).remove(managerAfterConsume);
      }
    });

    it('应该验证幂等性：重复消费同一个 token 应该失败', async () => {
      const payload = {
        title: '幂等性测试',
        inviteUrl: 'https://example.com/invite-manager-idempotent',
        email: 'manager-idempotent@example.com',
        managerName: '幂等性测试管理员',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 第一次消费应该成功
      const firstConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_MANAGER',
      );
      expect(firstConsumeResponse.body.data.consumeVerificationRecord.success).toBe(true);

      // 3. 第二次消费同一个 token 应该失败
      const secondConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_MANAGER',
      );
      expect(secondConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);

      // 检查错误信息是否存在
      if (secondConsumeResponse.body.data.consumeVerificationRecord.message) {
        expect(secondConsumeResponse.body.data.consumeVerificationRecord.message).toContain(
          '已被使用或已失效',
        );
      }

      // 清理测试数据
      const managerAfterTest = await dataSource.getRepository(ManagerEntity).findOne({
        where: { accountId: learnerAccountId },
      });
      if (managerAfterTest) {
        await dataSource.getRepository(ManagerEntity).remove(managerAfterTest);
      }
    });

    it('应该验证已存在 Manager 身份的处理：重新激活而不是重复创建', async () => {
      // 1. 先创建一个已停用的 Manager 身份
      const existingManager = dataSource.getRepository(ManagerEntity).create({
        accountId: learnerAccountId,
        name: '已存在的管理员',
        deactivatedAt: new Date(), // 设置为已停用
        remark: '测试用已停用管理员',
        createdBy: null,
        updatedBy: null,
      });
      await dataSource.getRepository(ManagerEntity).save(existingManager);

      const payload = {
        title: '重新激活测试',
        inviteUrl: 'https://example.com/invite-manager-reactivate',
        email: 'manager-reactivate@example.com',
        managerName: '重新激活的管理员',
        description: '重新激活的管理员描述',
      };

      // 2. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 3. 消费验证记录
      const consumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_MANAGER',
      );

      // 检查是否有 GraphQL 错误
      if (consumeResponse.body.errors) {
        console.error('GraphQL errors:', consumeResponse.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(consumeResponse.body.errors)}`);
      }

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');

      // 验证事务一致性：所有操作都应该成功完成
      const managerRepository = dataSource.getRepository(ManagerEntity);

      // 验证 Manager 身份已创建
      const managerAfterConsume = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });

      expect(managerAfterConsume).toBeDefined();
      expect(managerAfterConsume).not.toBeNull();
      expect(managerAfterConsume?.deactivatedAt).toBeNull();

      // 清理测试数据
      if (managerAfterConsume) {
        await managerRepository.remove(managerAfterConsume);
      }
    });

    it('应该验证并发消费的原子性：多个并发请求只有一个成功', async () => {
      const payload = {
        title: '并发消费测试',
        inviteUrl: 'https://example.com/invite-manager-concurrent',
        email: 'manager-concurrent@example.com',
        managerName: '并发测试管理员',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 并发发起多个消费请求
      const concurrentPromises = Array.from({ length: 3 }, () =>
        consumeVerificationRecord(app, token, learnerAccessToken, 'INVITE_MANAGER'),
      );

      const results = await Promise.allSettled(concurrentPromises);

      // 3. 验证只有一个请求成功
      const successfulResults = results.filter(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.body.data.consumeVerificationRecord.success === true,
      );

      const failedResults = results.filter(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.body.data.consumeVerificationRecord.success === false,
      );

      expect(successfulResults).toHaveLength(1);
      expect(failedResults.length).toBeGreaterThanOrEqual(2);

      // 4. 验证数据库中只创建了一个 Manager 记录
      const managerCount = await dataSource.getRepository(ManagerEntity).count({
        where: { accountId: learnerAccountId },
      });
      expect(managerCount).toBe(1);

      // 5. 清理测试数据
      const manager = await dataSource.getRepository(ManagerEntity).findOne({
        where: { accountId: learnerAccountId },
      });
      if (manager) {
        await dataSource.getRepository(ManagerEntity).remove(manager);
      }
    });

    it('应该验证匿名用户消费安全性：未登录用户不能消费验证记录', async () => {
      const payload = {
        title: '匿名消费安全测试',
        inviteUrl: 'https://example.com/invite-manager-anonymous',
        email: 'manager-anonymous@example.com',
        managerName: '匿名测试管理员',
      };

      // 1. 创建验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 尝试匿名消费（不提供 Bearer token）
      const anonymousConsumeResponse = await request(app.getHttpServer() as App)
        .post('/graphql')
        .send({
          query: `
            mutation ConsumeVerificationRecord($input: ConsumeVerificationRecordInput!) {
              consumeVerificationRecord(input: $input) {
                success
                message
                data {
                  id
                  status
                }
              }
            }
          `,
          variables: {
            input: {
              token,
              expectedType: 'INVITE_MANAGER',
            },
          },
        });

      console.log('匿名消费响应:', JSON.stringify(anonymousConsumeResponse.body, null, 2));

      // 3. 验证匿名消费应该失败
      expect(anonymousConsumeResponse.status).toBe(200);
      if (anonymousConsumeResponse.body.errors) {
        // 如果有 GraphQL 错误，应该是认证相关的错误
        expect(anonymousConsumeResponse.body.errors[0].extensions.errorCode).toMatch(
          /UNAUTHENTICATED|UNAUTHORIZED|AUTHENTICATION_REQUIRED|JWT_AUTHENTICATION_FAILED/,
        );
      } else {
        // 如果没有 GraphQL 错误，业务逻辑应该返回失败
        expect(anonymousConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);
      }

      // 4. 验证数据库中没有创建 Manager 记录
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerAfterAnonymousConsume = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      expect(managerAfterAnonymousConsume).toBeNull();
    });

    it('应该验证错误用户消费安全性：非目标用户不能消费验证记录', async () => {
      const payload = {
        title: '错误用户消费安全测试',
        inviteUrl: 'https://example.com/invite-manager-wrong-user',
        email: 'manager-wrong-user@example.com',
        managerName: '错误用户测试管理员',
      };

      // 1. 创建针对 learnerAccountId 的验证记录
      const createResponse = await createVerificationRecord(
        app,
        'INVITE_MANAGER',
        payload,
        managerAccessToken,
        {
          targetAccountId: learnerAccountId,
          subjectType: 'MANAGER',
          subjectId: 1,
        },
      );

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      const token = createResponse.body.data.createVerificationRecord.token;

      // 2. 尝试用 Manager 账号消费（而不是目标 Learner 账号）
      const wrongUserConsumeResponse = await consumeVerificationRecord(
        app,
        token,
        managerAccessToken, // 使用错误的用户 token
        'INVITE_MANAGER',
      );

      console.log('错误用户消费响应:', JSON.stringify(wrongUserConsumeResponse.body, null, 2));

      // 3. 验证错误用户消费应该失败
      expect(wrongUserConsumeResponse.body.data.consumeVerificationRecord.success).toBe(false);

      // 检查错误信息
      if (wrongUserConsumeResponse.body.data.consumeVerificationRecord.message) {
        expect(wrongUserConsumeResponse.body.data.consumeVerificationRecord.message).toMatch(
          /权限|授权|目标|用户/,
        );
      }

      // 4. 验证数据库中没有创建 Manager 记录
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerAfterWrongUserConsume = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      expect(managerAfterWrongUserConsume).toBeNull();
    });

    /**
     * 发起 GraphQL 调用生成微信小程序二维码
     * @param app Nest 应用实例
     * @param input 生成参数（ audience / scene / page / width 等 ）
     */
    async function generateWeappQrcode(
      app: INestApplication,
      input: {
        audience: string;
        scene: string;
        page?: string;
        width?: number;
        checkPath?: boolean;
        envVersion?: 'develop' | 'trial' | 'release';
        isHyaline?: boolean;
        encodeBase64?: boolean;
      },
    ) {
      return await postGql(
        app,
        `
        mutation GenerateWeappQrcode($input: GenerateWeappQrcodeInput!) {
          generateWeappQrcode(input: $input) {
            contentType
            imageBase64
            imageBufferBase64
          }
        }
      `,
        { input },
      );
    }

    describe('第三方 WeApp：二维码生成', () => {
      it('应该生成指向链接的微信小程序二维码', async () => {
        // 使用符合微信场景限制的“链接表达”字符串（不含 t= 前缀）
        const scene = 'invite_link_example_1234567890';
        const page = 'pages/invite/index';

        const resp = await generateWeappQrcode(app, {
          audience: 'SSTSWEAPP',
          scene,
          page,
          width: 320,
          checkPath: true,
          envVersion: 'trial',
          isHyaline: false,
          encodeBase64: true,
        });

        if (resp.body.errors) {
          throw new Error(`GraphQL 错误: ${JSON.stringify(resp.body.errors)}`);
        }

        const result = resp.body.data.generateWeappQrcode;
        expect(result).toBeDefined();
        expect(result.contentType).toBe('image/png');
        expect(typeof result.imageBase64).toBe('string');
        expect(result.imageBase64.length).toBeGreaterThan(0);

        // 断言 provider 被正确调用（ scene 原样传递 ）
        const provider = app.get(WeAppProvider);
        const calls = (provider as unknown as { createWxaCodeUnlimit: jest.Mock })
          .createWxaCodeUnlimit.mock.calls;
        const lastCallArgs = calls[calls.length - 1]?.[0] as {
          scene: string;
          page?: string;
          width?: number;
          checkPath?: boolean;
          envVersion?: 'develop' | 'trial' | 'release';
          isHyaline?: boolean;
        };
        expect(lastCallArgs.scene).toBe(scene);
        expect(lastCallArgs.page).toBe(page);
      });

      it('应该为 INVITE_COACH 验证记录生成二维码，scene=token（无 t= 前缀）', async () => {
        // 1. 创建邀请教练的验证记录，获取明文 token
        const payload = {
          title: '邀请教练二维码',
          inviteUrl: 'https://example.com/invite-coach',
          email: 'coach-qrcode@example.com',
          coachName: '二维码教练',
        };

        const createResp = await createVerificationRecord(
          app,
          'INVITE_COACH',
          payload,
          managerAccessToken,
          {
            targetAccountId: learnerAccountId,
            subjectType: 'COACH',
            subjectId: 1,
            returnToken: true,
          },
        );

        if (createResp.body.errors) {
          throw new Error(`GraphQL 错误: ${JSON.stringify(createResp.body.errors)}`);
        }
        const token: string = createResp.body.data.createVerificationRecord.token;
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
        expect(token.length).toBeLessThanOrEqual(32);

        // 2. 使用 token 作为 scene 生成微信二维码
        const qrcodeResp = await generateWeappQrcode(app, {
          audience: 'SSTSWEAPP',
          scene: token,
          page: 'pages/invite/index',
          encodeBase64: true,
        });

        if (qrcodeResp.body.errors) {
          throw new Error(`GraphQL 错误: ${JSON.stringify(qrcodeResp.body.errors)}`);
        }

        const qrcodeResult = qrcodeResp.body.data.generateWeappQrcode;
        expect(qrcodeResult.contentType).toBe('image/png');
        expect(typeof qrcodeResult.imageBase64).toBe('string');
        expect(qrcodeResult.imageBase64.length).toBeGreaterThan(0);

        // 断言 provider 收到的 scene 正是明文 token（无 t= 前缀）
        const provider = app.get(WeAppProvider);
        const calls = (provider as unknown as { createWxaCodeUnlimit: jest.Mock })
          .createWxaCodeUnlimit.mock.calls;
        const lastCallArgs = calls[calls.length - 1]?.[0] as { scene: string };
        expect(lastCallArgs.scene).toBe(token);
      });

      it('应该为 INVITE_MANAGER 验证记录生成二维码，scene=token（无 t= 前缀）', async () => {
        // 1. 创建邀请管理员的验证记录，获取明文 token
        const payload = {
          title: '邀请管理员二维码',
          inviteUrl: 'https://example.com/invite-manager',
          email: 'manager-qrcode@example.com',
          managerName: '二维码管理员',
        };

        const createResp = await createVerificationRecord(
          app,
          'INVITE_MANAGER',
          payload,
          managerAccessToken,
          {
            targetAccountId: learnerAccountId,
            subjectType: 'MANAGER',
            subjectId: 1,
            returnToken: true,
          },
        );

        if (createResp.body.errors) {
          throw new Error(`GraphQL 错误: ${JSON.stringify(createResp.body.errors)}`);
        }
        const token: string = createResp.body.data.createVerificationRecord.token;
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
        expect(token.length).toBeLessThanOrEqual(32);

        // 2. 使用 token 作为 scene 生成微信二维码
        const qrcodeResp = await generateWeappQrcode(app, {
          audience: 'SJWEAPP',
          scene: token,
          page: 'pages/invite/index',
          encodeBase64: true,
        });

        if (qrcodeResp.body.errors) {
          throw new Error(`GraphQL 错误: ${JSON.stringify(qrcodeResp.body.errors)}`);
        }

        const qrcodeResult = qrcodeResp.body.data.generateWeappQrcode;
        expect(qrcodeResult.contentType).toBe('image/png');
        expect(typeof qrcodeResult.imageBase64).toBe('string');
        expect(qrcodeResult.imageBase64.length).toBeGreaterThan(0);

        // 断言 provider 收到的 scene 正是明文 token（无 t= 前缀）
        const provider = app.get(WeAppProvider);
        const calls = (provider as unknown as { createWxaCodeUnlimit: jest.Mock })
          .createWxaCodeUnlimit.mock.calls;
        const lastCallArgs = calls[calls.length - 1]?.[0] as { scene: string };
        expect(lastCallArgs.scene).toBe(token);
      });
    });
  });

  describe('邀请用例：INVITE_LEARNER', () => {
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
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

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

    // it('应该能够消费邀请学员验证记录', async () => {
    //   const payload = {
    //     title: '邀请学员消费测试',
    //     inviteUrl: 'https://example.com/invite-learner-consume',
    //     email: 'learner-consume@example.com',
    //     learnerName: '小红',
    //   };

    //   const createResponse = await createVerificationRecord(
    //     app,
    //     'INVITE_LEARNER',
    //     payload,
    //     managerAccessToken,
    //     {
    //       targetAccountId: learnerAccountId,
    //       subjectType: 'LEARNER',
    //       subjectId: learnerSubject.id,
    //     },
    //   );

    //   console.log('INVITE_LEARNER 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

    //   expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
    //   expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
    //   expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

    //   const token = createResponse.body.data.createVerificationRecord.token;
    //   const consumeResponse = await consumeVerificationRecord(
    //     app,
    //     token,
    //     learnerAccessToken,
    //     'INVITE_LEARNER',
    //   );

    //   console.log('INVITE_LEARNER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

    //   expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
    //   expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    // });
  });

  // describe('注册时消费邀请码场景', () => {
  //   /**
  //    * 执行 GraphQL 注册请求
  //    */
  //   const performRegister = async (input: any) => {
  //     const response = await request(app.getHttpServer())
  //       .post('/graphql')
  //       .send({
  //         query: `
  //           mutation Register($input: RegisterInput!) {
  //             register(input: $input) {
  //               success
  //               message
  //               accountId
  //             }
  //           }
  //         `,
  //         variables: {
  //           input,
  //         },
  //       });

  //     return response;
  //   };

  //   /**
  //    * 测试注册时成功消费邀请令牌
  //    */
  //   it('应该支持注册时消费有效的 INVITE_COACH 邀请令牌', async () => {
  //     // 1. 创建邀请令牌
  //     const payload = {
  //       title: '注册消费邀请测试',
  //       inviteUrl: 'https://example.com/invite-coach-register',
  //       email: 'register-coach@example.com',
  //       coachName: '注册测试教练',
  //     };

  //     const createResponse = await createVerificationRecord(
  //       app,
  //       'INVITE_COACH',
  //       payload,
  //       managerAccessToken,
  //       {
  //         subjectType: 'COACH',
  //         subjectId: 1,
  //       },
  //     );

  //     expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
  //     const inviteToken = createResponse.body.data.createVerificationRecord.token;
  //     expect(inviteToken).toBeDefined();

  //     // 2. 使用邀请令牌注册
  //     const registerInput = {
  //       loginName: 'inviteregister',
  //       loginEmail: 'inviteregister@example.com',
  //       loginPassword: 'TestPass123!',
  //       nickname: '邀请注册用户',
  //       type: 'REGISTRANT',
  //       inviteToken,
  //     };

  //     const registerResponse = await performRegister(registerInput);

  //     expect(registerResponse.status).toBe(200);
  //     const { data } = registerResponse.body;
  //     expect(data?.register.success).toBe(true);
  //     expect(data?.register.accountId).toBeDefined();

  //     const accountId = parseInt(data?.register.accountId);

  //     // 3. 验证账户创建成功
  //     const accountRepository = dataSource.getRepository('AccountEntity');
  //     const account = await accountRepository.findOne({
  //       where: { id: accountId },
  //     });

  //     expect(account).toBeDefined();
  //     expect(account?.loginName).toBe(registerInput.loginName);
  //     expect(account?.loginEmail).toBe(registerInput.loginEmail);

  //     // 4. 验证 Coach 身份已创建
  //     const coachRepository = dataSource.getRepository(CoachEntity);
  //     const coach = await coachRepository.findOne({
  //       where: { accountId },
  //     });

  //     expect(coach).toBeDefined();
  //     expect(coach?.accountId).toBe(accountId);

  //     // 5. 验证邀请令牌已被消费
  //     const verificationRepository = dataSource.getRepository('VerificationRecordEntity');
  //     const verificationRecord = await verificationRepository.findOne({
  //       where: { token: inviteToken },
  //     });

  //     expect(verificationRecord).toBeDefined();
  //     expect(verificationRecord?.consumedByAccountId).toBe(accountId);
  //     expect(verificationRecord?.consumedAt).toBeDefined();

  //     // 清理测试数据
  //     if (coach) {
  //       await coachRepository.remove(coach);
  //     }
  //     if (account) {
  //       await accountRepository.remove(account);
  //     }
  //   });

  //   /**
  //    * 测试注册时使用无效邀请令牌不影响注册成功
  //    */
  //   it('使用无效邀请令牌注册时应该注册成功但不消费令牌', async () => {
  //     const registerInput = {
  //       loginName: 'invalidtoken',
  //       loginEmail: 'invalidtoken@example.com',
  //       loginPassword: 'TestPass123!',
  //       nickname: '无效令牌用户',
  //       type: 'REGISTRANT',
  //       inviteToken: 'invalid-token-12345',
  //     };

  //     const registerResponse = await performRegister(registerInput);

  //     expect(registerResponse.status).toBe(200);
  //     const { data } = registerResponse.body;
  //     expect(data?.register.success).toBe(true);
  //     expect(data?.register.accountId).toBeDefined();

  //     const accountId = parseInt(data?.register.accountId);

  //     // 验证账户创建成功
  //     const accountRepository = dataSource.getRepository('AccountEntity');
  //     const account = await accountRepository.findOne({
  //       where: { id: accountId },
  //     });

  //     expect(account).toBeDefined();
  //     expect(account?.loginName).toBe(registerInput.loginName);

  //     // 验证没有创建 Coach 身份
  //     const coachRepository = dataSource.getRepository(CoachEntity);
  //     const coach = await coachRepository.findOne({
  //       where: { accountId },
  //     });

  //     expect(coach).toBeNull();

  //     // 清理测试数据
  //     if (account) {
  //       await accountRepository.remove(account);
  //     }
  //   });

  //   /**
  //    * 测试注册时不提供邀请令牌的正常流程
  //    */
  //   it('不提供邀请令牌时应该正常注册', async () => {
  //     const registerInput = {
  //       loginName: 'notoken',
  //       loginEmail: 'notoken@example.com',
  //       loginPassword: 'TestPass123!',
  //       nickname: '普通注册用户',
  //       type: 'REGISTRANT',
  //       // 不提供 inviteToken
  //     };

  //     const registerResponse = await performRegister(registerInput);

  //     expect(registerResponse.status).toBe(200);
  //     const { data } = registerResponse.body;
  //     expect(data?.register.success).toBe(true);
  //     expect(data?.register.accountId).toBeDefined();

  //     const accountId = parseInt(data?.register.accountId);

  //     // 验证账户创建成功
  //     const accountRepository = dataSource.getRepository('AccountEntity');
  //     const account = await accountRepository.findOne({
  //       where: { id: accountId },
  //     });

  //     expect(account).toBeDefined();
  //     expect(account?.loginName).toBe(registerInput.loginName);

  //     // 验证没有创建 Coach 身份
  //     const coachRepository = dataSource.getRepository(CoachEntity);
  //     const coach = await coachRepository.findOne({
  //       where: { accountId },
  //     });

  //     expect(coach).toBeNull();

  //     // 清理测试数据
  //     if (account) {
  //       await accountRepository.remove(account);
  //     }
  //   });
  // });
});
