// test/05-verification-record/verification-record-invite.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { TokenHelper } from '@core/common/token/token.helper';
import { AppModule } from '@src/app.module';
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
async function consumeVerificationRecord(app: INestApplication, token: string, bearer: string) {
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
    { input: { token } },
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
    await cleanupTestAccounts(dataSource);
    await app.close();
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
      const consumeResponse = await consumeVerificationRecord(app, token, learnerAccessToken);

      console.log('INVITE_LEARNER 消费响应:', JSON.stringify(consumeResponse.body, null, 2));

      expect(consumeResponse.body.data.consumeVerificationRecord.success).toBe(true);
      expect(consumeResponse.body.data.consumeVerificationRecord.data.status).toBe('CONSUMED');
    });
  });
});
