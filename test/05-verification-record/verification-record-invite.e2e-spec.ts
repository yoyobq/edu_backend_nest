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
          targetAccountId: learnerAccountId,
          subjectType: 'LEARNER',
          subjectId: learnerSubject.id,
        },
      );

      console.log('INVITE_LEARNER 消费测试创建响应:', JSON.stringify(createResponse.body, null, 2));

      expect(createResponse.body.data.createVerificationRecord.success).toBe(true);
      expect(createResponse.body.data.createVerificationRecord.token).toBeDefined();
      expect(createResponse.body.data.createVerificationRecord.token).not.toBeNull();

      const token = createResponse.body.data.createVerificationRecord.token;
      const consumeResponse = await consumeVerificationRecord(
        app,
        token,
        learnerAccessToken,
        'INVITE_LEARNER',
      );

      console.log('INVITE_LEARNER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });
});
