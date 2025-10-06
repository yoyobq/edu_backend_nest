// test/05-verification-record/verification-record-invite.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { TokenHelper } from '@core/common/token/token.helper';
import { AppModule } from '@src/app.module';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
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

describe('验证记录邀请类型测试 E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  let managerAccessToken: string;
  let learnerAccessToken: string;
  let learnerAccountId: number;
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

  describe('INVITE_COACH 类型', () => {
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
          targetAccountId: learnerAccountId,
          subjectType: 'COACH',
          subjectId: 1,
        },
      );

      console.log('INVITE_COACH 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

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

      console.log(
        'INVITE_COACH 消费响应 success:',
        consumeResponse.body.data?.consumeVerificationRecord?.success,
      );
      console.log('INVITE_COACH 消费响应 errors:', consumeResponse.body.errors);
      console.log('INVITE_COACH 完整消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      // 检查是否有 GraphQL 错误
      if (consumeResponse.body.errors) {
        console.error('GraphQL 错误:', consumeResponse.body.errors);
        throw new Error(`GraphQL 错误: ${JSON.stringify(consumeResponse.body.errors)}`);
      }

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');

      // 验证事务一致性：所有操作都应该成功完成

      // 获取消费前的状态
      const coachRepository = dataSource.getRepository(CoachEntity);

      // 验证 Coach 身份已创建
      const coachAfterConsume = await coachRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      console.log('消费后 Coach 状态:', coachAfterConsume);
      console.log('查询的 learnerAccountId:', learnerAccountId);
      console.log(
        '消费响应中的 success:',
        consumeResponse.body.data.consumeVerificationRecord.success,
      );
      console.log('消费响应中的 errors:', consumeResponse.body.errors);

      expect(coachAfterConsume).toBeDefined();
      expect(coachAfterConsume).not.toBeNull();
      expect(coachAfterConsume?.deactivatedAt).toBeNull();

      console.log('消费后 Coach 状态:', coachAfterConsume);

      // 清理测试数据
      if (coachAfterConsume) {
        await coachRepository.remove(coachAfterConsume);
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

      console.log(
        '重复消费错误信息:',
        secondConsumeResponse.body.data.consumeVerificationRecord.message,
      );

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

      console.log('重新激活前 Coach ID:', existingCoach.id);
      console.log('重新激活后 Coach ID:', coachAfterReactivate?.id);
      console.log('重新激活后状态:', coachAfterReactivate?.deactivatedAt);

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

      console.log('并发测试结果 - 成功:', successfulResults.length, '失败:', failedResults.length);

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

      console.log('错误用户消费响应:', JSON.stringify(wrongUserConsumeResponse.body, null, 2));

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

  describe('INVITE_MANAGER 类型', () => {
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

      console.log('INVITE_MANAGER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

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
      console.log('消费后 Manager 状态:', managerAfterConsume);
      console.log('查询的 learnerAccountId:', learnerAccountId);
      console.log(
        '消费响应中的 success:',
        consumeResponse.body.data.consumeVerificationRecord.success,
      );
      console.log('消费响应中的 errors:', consumeResponse.body.errors);

      expect(managerAfterConsume).toBeDefined();
      expect(managerAfterConsume).not.toBeNull();
      expect(managerAfterConsume?.deactivatedAt).toBeNull();

      console.log('消费后 Manager 状态:', managerAfterConsume);

      // 清理测试数据
      if (managerAfterConsume) {
        await managerRepository.remove(managerAfterConsume);
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

      console.log(
        '重复消费错误信息:',
        secondConsumeResponse.body.data.consumeVerificationRecord.message,
      );

      // 清理测试数据
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerAfterTest = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (managerAfterTest) {
        await managerRepository.remove(managerAfterTest);
      }
    });

    it('应该验证已存在 Manager 身份的处理：重新激活而不是重复创建', async () => {
      const managerRepository = dataSource.getRepository(ManagerEntity);

      // 1. 先创建一个已停用的 Manager 身份
      const existingManager = managerRepository.create({
        accountId: learnerAccountId,
        name: '已存在的管理员',
        deactivatedAt: new Date(), // 设置为已停用
        remark: '测试用已停用管理员',
        createdBy: null,
        updatedBy: null,
      });
      await managerRepository.save(existingManager);

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
      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);

      // 4. 验证 Manager 身份被重新激活而不是重复创建
      const managerAfterReactivate = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });

      expect(managerAfterReactivate).toBeDefined();
      expect(managerAfterReactivate?.id).toBe(existingManager.id); // 应该是同一个实体
      expect(managerAfterReactivate?.deactivatedAt).toBeNull(); // 应该被重新激活
      expect(managerAfterReactivate?.name).toBe('已存在的管理员'); // 名称不应该被更新

      console.log('重新激活前 Manager ID:', existingManager.id);
      console.log('重新激活后 Manager ID:', managerAfterReactivate?.id);
      console.log('重新激活后状态:', managerAfterReactivate?.deactivatedAt);

      // 5. 清理测试数据
      await managerRepository.remove(managerAfterReactivate!);
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

      console.log(
        'Manager 并发测试结果 - 成功:',
        successfulResults.length,
        '失败:',
        failedResults.length,
      );

      // 4. 验证数据库中只创建了一个 Manager 记录
      const managerRepository = dataSource.getRepository(ManagerEntity);
      const managerCount = await managerRepository.count({
        where: { accountId: learnerAccountId },
      });
      expect(managerCount).toBe(1);

      // 5. 清理测试数据
      const manager = await managerRepository.findOne({
        where: { accountId: learnerAccountId },
      });
      if (manager) {
        await managerRepository.remove(manager);
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
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
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
