// 文件位置：test/09-user-info/update-access-group.e2e-spec.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { AccountEntity } from '../../src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '../../src/modules/account/base/entities/user-info.entity';
import { getAccountIdByLoginName, login } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

type UpdateAccessGroupInput = {
  accountId: number;
  accessGroup: IdentityTypeEnum[];
  identityHint?: IdentityTypeEnum;
};

type UpdateAccessGroupResult = {
  accountId: number;
  accessGroup: IdentityTypeEnum[];
  identityHint: IdentityTypeEnum;
  isUpdated: boolean;
};

type GqlError = {
  message: string;
  extensions?: { code?: string; errorCode?: string };
};

type UpdateAccessGroupResponse = {
  data?: { updateAccessGroup?: UpdateAccessGroupResult };
  errors?: GqlError[];
};

/**
 * 执行 updateAccessGroup GraphQL 变更
 */
async function executeUpdateAccessGroup(params: {
  app: INestApplication;
  token: string;
  input: UpdateAccessGroupInput;
}): Promise<Response> {
  const { app, token, input } = params;
  return await request(app.getHttpServer())
    .post('/graphql')
    .set('Authorization', `Bearer ${token}`)
    .send({
      query: `
        mutation UpdateAccessGroup($input: UpdateAccessGroupInput!) {
          updateAccessGroup(input: $input) {
            accountId
            accessGroup
            identityHint
            isUpdated
          }
        }
      `,
      variables: { input },
    })
    .expect(200);
}

/**
 * 读取 updateAccessGroup 响应体
 */
function readUpdateAccessGroupBody(params: { response: Response }): UpdateAccessGroupResponse {
  return params.response.body as UpdateAccessGroupResponse;
}

describe('UpdateAccessGroup (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let managerToken: string;
  let coachToken: string;
  let customerToken: string;

  let adminAccountId: number;
  let managerAccountId: number;
  let customerAccountId: number;
  let learnerAccountId: number;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      includeKeys: ['admin', 'manager', 'coach', 'customer', 'learner'],
    });

    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });
    managerToken = await login({
      app,
      loginName: testAccountsConfig.manager.loginName,
      loginPassword: testAccountsConfig.manager.loginPassword,
    });
    coachToken = await login({
      app,
      loginName: testAccountsConfig.coach.loginName,
      loginPassword: testAccountsConfig.coach.loginPassword,
    });
    customerToken = await login({
      app,
      loginName: testAccountsConfig.customer.loginName,
      loginPassword: testAccountsConfig.customer.loginPassword,
    });

    adminAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.admin.loginName);
    managerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.manager.loginName,
    );
    customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.customer.loginName,
    );
    learnerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.learner.loginName,
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('正例', () => {
    it('ADMIN 更新 learner 访问组并自动生成身份提示', async () => {
      const input: UpdateAccessGroupInput = {
        accountId: learnerAccountId,
        accessGroup: [IdentityTypeEnum.LEARNER, IdentityTypeEnum.CUSTOMER],
      };
      const res = await executeUpdateAccessGroup({ app, token: adminToken, input });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.LEARNER, IdentityTypeEnum.CUSTOMER]);
      expect(result.identityHint).toBe(IdentityTypeEnum.CUSTOMER);
      expect(result.isUpdated).toBe(true);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const updatedUserInfo = await userInfoRepo.findOne({
        where: { accountId: learnerAccountId },
      });
      if (!updatedUserInfo) throw new Error('用户信息不存在');
      expect(updatedUserInfo.accessGroup).toEqual([
        IdentityTypeEnum.LEARNER,
        IdentityTypeEnum.CUSTOMER,
      ]);
      expect(updatedUserInfo.metaDigest).toEqual([
        IdentityTypeEnum.LEARNER,
        IdentityTypeEnum.CUSTOMER,
      ]);

      const updatedAccount = await accountRepo.findOne({ where: { id: learnerAccountId } });
      if (!updatedAccount) throw new Error('账户不存在');
      expect(updatedAccount.identityHint).toBe(IdentityTypeEnum.CUSTOMER);
    });

    it('MANAGER 指定身份提示更新客户访问组', async () => {
      const input: UpdateAccessGroupInput = {
        accountId: customerAccountId,
        accessGroup: [IdentityTypeEnum.CUSTOMER, IdentityTypeEnum.COACH],
        identityHint: IdentityTypeEnum.COACH,
      };
      const res = await executeUpdateAccessGroup({ app, token: managerToken, input });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.CUSTOMER, IdentityTypeEnum.COACH]);
      expect(result.identityHint).toBe(IdentityTypeEnum.COACH);
      expect(result.isUpdated).toBe(true);

      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const updatedUserInfo = await userInfoRepo.findOne({
        where: { accountId: customerAccountId },
      });
      if (!updatedUserInfo) throw new Error('用户信息不存在');
      expect(updatedUserInfo.accessGroup).toEqual([
        IdentityTypeEnum.CUSTOMER,
        IdentityTypeEnum.COACH,
      ]);
      expect(updatedUserInfo.metaDigest).toEqual([
        IdentityTypeEnum.CUSTOMER,
        IdentityTypeEnum.COACH,
      ]);

      const updatedAccount = await accountRepo.findOne({ where: { id: customerAccountId } });
      if (!updatedAccount) throw new Error('账户不存在');
      expect(updatedAccount.identityHint).toBe(IdentityTypeEnum.COACH);
    });

    it('幂等：重复访问组不触发更新', async () => {
      const prepare = await executeUpdateAccessGroup({
        app,
        token: managerToken,
        input: {
          accountId: customerAccountId,
          accessGroup: [IdentityTypeEnum.CUSTOMER],
          identityHint: IdentityTypeEnum.CUSTOMER,
        },
      });
      const prepareBody = readUpdateAccessGroupBody({ response: prepare });
      if (prepareBody.errors) throw new Error('前置失败：无法准备访问组');

      const res = await executeUpdateAccessGroup({
        app,
        token: managerToken,
        input: {
          accountId: customerAccountId,
          accessGroup: [IdentityTypeEnum.CUSTOMER, IdentityTypeEnum.CUSTOMER],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });

      expect(body.errors).toBeUndefined();
      const result = body.data?.updateAccessGroup;
      if (!result) throw new Error('更新访问组失败：缺少返回数据');
      expect(result.accessGroup).toEqual([IdentityTypeEnum.CUSTOMER]);
      expect(result.identityHint).toBe(IdentityTypeEnum.CUSTOMER);
      expect(result.isUpdated).toBe(false);
    });
  });

  describe('负例', () => {
    it('CUSTOMER 更新访问组应拒绝', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: customerToken,
        input: {
          accountId: learnerAccountId,
          accessGroup: [IdentityTypeEnum.LEARNER],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('COACH 更新访问组应拒绝', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: coachToken,
        input: {
          accountId: managerAccountId,
          accessGroup: [IdentityTypeEnum.MANAGER],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('访问组为空应返回校验错误', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: adminAccountId,
          accessGroup: [],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('身份提示不在访问组内应报错', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: learnerAccountId,
          accessGroup: [IdentityTypeEnum.LEARNER],
          identityHint: IdentityTypeEnum.CUSTOMER,
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('OPERATION_NOT_SUPPORTED');
    });

    it('目标账户不存在应报错', async () => {
      const res = await executeUpdateAccessGroup({
        app,
        token: adminToken,
        input: {
          accountId: 999999,
          accessGroup: [IdentityTypeEnum.CUSTOMER],
        },
      });
      const body = readUpdateAccessGroupBody({ response: res });
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCOUNT_NOT_FOUND');
    });
  });
});
