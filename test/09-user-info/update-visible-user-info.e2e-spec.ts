// 文件位置：test/09-user-info/update-visible-user-info.e2e-spec.ts
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginTypeEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { AccountEntity } from '../../src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '../../src/modules/account/base/entities/user-info.entity';
import { AccountService } from '../../src/modules/account/base/services/account.service';
import { CustomerEntity } from '../../src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '../../src/modules/account/identities/training/learner/account-learner.entity';
import { getAccountIdByLoginName } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 登录并获取访问令牌
 * - 使用 GraphQL `login` 变更，返回 `accessToken`
 */
async function loginAndGetToken(
  app: INestApplication,
  loginName: string,
  loginPassword: string,
): Promise<string> {
  const resp = await request(app.getHttpServer())
    .post('/graphql')
    .send({
      query: `
        mutation Login($input: AuthLoginInput!) {
          login(input: $input) { accessToken }
        }
      `,
      variables: {
        input: {
          loginName,
          loginPassword,
          type: LoginTypeEnum.PASSWORD,
          audience: AudienceTypeEnum.DESKTOP,
        },
      },
    })
    .expect(200);
  if (resp.body.errors) throw new Error(`登录失败: ${JSON.stringify(resp.body.errors)}`);
  return resp.body.data.login.accessToken as string;
}

/**
 * 读取当前用户的 `accountId`
 * - 通过 GraphQL `login` 返回的字段获取
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
async function _getMyAccountId(
  app: INestApplication,
  loginName: string,
  loginPassword: string,
): Promise<number> {
  const resp = await request(app.getHttpServer())
    .post('/graphql')
    .send({
      query: `
        mutation Login($input: AuthLoginInput!) { login(input: $input) { accountId } }
      `,
      variables: {
        input: {
          loginName,
          loginPassword,
          type: LoginTypeEnum.PASSWORD,
          audience: AudienceTypeEnum.DESKTOP,
        },
      },
    })
    .expect(200);
  if (resp.body.errors) throw new Error(`读取 accountId 失败: ${JSON.stringify(resp.body.errors)}`);
  return resp.body.data.login.accountId as number;
}

/**
 * 执行 `updateUserInfo` 变更
 * - 返回 `{ isUpdated, userInfo }` 结果；若有错误则携带 `errors`
 */
async function updateUserInfo(
  app: INestApplication,
  token: string,
  input: Record<string, unknown>,
) {
  return await request(app.getHttpServer())
    .post('/graphql')
    .set('Authorization', `Bearer ${token}`)
    .send({
      query: `
        mutation UpdateUserInfo($input: UpdateUserInfoInput!) {
          updateUserInfo(input: $input) {
            isUpdated
            userInfo {
              accountId nickname gender birthDate avatarUrl email signature address phone tags geographic
              accessGroup notifyCount unreadCount userState createdAt updatedAt
            }
          }
        }
      `,
      variables: { input },
    })
    .expect(200);
}

/**
 * 读取账户的 identityHint
 */
async function getAccountIdentityHint(
  dataSource: DataSource,
  accountId: number,
): Promise<string | null> {
  const accountRepo = dataSource.getRepository(AccountEntity);
  const account = await accountRepo.findOne({ where: { id: accountId } });
  if (!account) throw new Error('读取 account.identityHint 失败：账户不存在');
  return account.identityHint ?? null;
}

/**
 * 创建第二个 Customer 与其名下 Learner（用于跨归属权限测试）
 * - 保证 `user_info.metaDigest` 与 `accessGroup` 一致，避免安全检查暂停账号
 */
async function ensureOtherCustomerAndLearner(ds: DataSource): Promise<{
  otherCustomerAccountId: number;
  otherLearnerAccountId: number;
}> {
  const accountRepo = ds.getRepository(AccountEntity);
  const userInfoRepo = ds.getRepository(UserInfoEntity);
  const customerRepo = ds.getRepository(CustomerEntity);
  const learnerRepo = ds.getRepository(LearnerEntity);

  const custLogin = 'othercustomer';
  const custEmail = 'othercustomer@example.com';
  const custPass = 'OtherCustomer@2024';

  const existed: AccountEntity | null = await accountRepo.findOne({
    where: { loginName: custLogin },
  });
  let custAccount: AccountEntity;
  if (existed) {
    custAccount = existed;
  } else {
    const created = accountRepo.create({
      loginName: custLogin,
      loginEmail: custEmail,
      loginPassword: 'temp',
      status: AccountStatus.ACTIVE,
      identityHint: IdentityTypeEnum.CUSTOMER,
    });
    await accountRepo.save(created);
    const saved = await accountRepo.findOne({ where: { loginName: custLogin } });
    if (!saved) throw new Error('创建 othercustomer 账号失败');
    custAccount = saved;
  }

  if (!existed) {
    const hashed = AccountService.hashPasswordWithTimestamp(custPass, custAccount.createdAt);
    await accountRepo.update(custAccount.id, { loginPassword: hashed });

    await userInfoRepo.save(
      userInfoRepo.create({
        accountId: custAccount.id,
        nickname: `${custLogin}_nickname`,
        gender: Gender.SECRET,
        email: custEmail,
        accessGroup: [IdentityTypeEnum.CUSTOMER],
        metaDigest: [IdentityTypeEnum.CUSTOMER],
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      }),
    );

    await customerRepo.save(
      customerRepo.create({
        accountId: custAccount.id,
        name: `${custLogin}_customer_name`,
        contactPhone: '13999990000',
        preferredContactTime: 'ANY',
        membershipLevel: 1,
        deactivatedAt: null,
        remark: '测试 other customer',
      }),
    );
  }

  const learnerLogin = 'otherlearner';
  const learnerEmail = 'otherlearner@example.com';
  const learnerPass = 'OtherLearner@2024';
  const existedLearner: AccountEntity | null = await accountRepo.findOne({
    where: { loginName: learnerLogin },
  });
  let learnerAccount: AccountEntity;
  if (existedLearner) {
    learnerAccount = existedLearner;
  } else {
    const createdL = accountRepo.create({
      loginName: learnerLogin,
      loginEmail: learnerEmail,
      loginPassword: 'temp',
      status: AccountStatus.ACTIVE,
      identityHint: IdentityTypeEnum.LEARNER,
    });
    await accountRepo.save(createdL);
    const savedL = await accountRepo.findOne({ where: { loginName: learnerLogin } });
    if (!savedL) throw new Error('创建 otherlearner 账号失败');
    learnerAccount = savedL;
  }

  if (!existedLearner) {
    const hashedL = AccountService.hashPasswordWithTimestamp(learnerPass, learnerAccount.createdAt);
    await accountRepo.update(learnerAccount.id, { loginPassword: hashedL });

    await userInfoRepo.save(
      userInfoRepo.create({
        accountId: learnerAccount.id,
        nickname: `${learnerLogin}_nickname`,
        gender: Gender.SECRET,
        email: learnerEmail,
        accessGroup: [IdentityTypeEnum.LEARNER],
        metaDigest: [IdentityTypeEnum.LEARNER],
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      }),
    );

    const otherCustomer = await customerRepo.findOne({ where: { accountId: custAccount.id } });
    if (!otherCustomer) throw new Error('前置失败：未找到 other customer');

    await learnerRepo.save(
      learnerRepo.create({
        accountId: learnerAccount.id,
        customerId: otherCustomer.id,
        name: `${learnerLogin}_learner_name`,
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        specialNeeds: '测试 other learner',
        countPerSession: 1,
        deactivatedAt: null,
        remark: '测试 other learner 身份',
        createdBy: null,
        updatedBy: null,
      }),
    );
  }

  return { otherCustomerAccountId: custAccount.id, otherLearnerAccountId: learnerAccount.id };
}

describe('UpdateVisibleUserInfo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let managerToken: string;
  let coachToken: string;
  let customerToken: string;
  let learnerToken: string;

  let adminAccountId: number;
  let managerAccountId: number;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let coachAccountId: number;
  let customerAccountId: number;
  let learnerAccountId: number;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let otherCustomerAccountId: number;
  let otherLearnerAccountId: number;

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

    adminToken = await loginAndGetToken(
      app,
      testAccountsConfig.admin.loginName,
      testAccountsConfig.admin.loginPassword,
    );
    managerToken = await loginAndGetToken(
      app,
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
    coachToken = await loginAndGetToken(
      app,
      testAccountsConfig.coach.loginName,
      testAccountsConfig.coach.loginPassword,
    );
    customerToken = await loginAndGetToken(
      app,
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );
    learnerToken = await loginAndGetToken(
      app,
      testAccountsConfig.learner.loginName,
      testAccountsConfig.learner.loginPassword,
    );

    adminAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.admin.loginName);
    managerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.manager.loginName,
    );
    coachAccountId = await getAccountIdByLoginName(dataSource, testAccountsConfig.coach.loginName);
    customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.customer.loginName,
    );
    learnerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.learner.loginName,
    );

    const created = await ensureOtherCustomerAndLearner(dataSource);
    otherCustomerAccountId = created.otherCustomerAccountId;
    otherLearnerAccountId = created.otherLearnerAccountId;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('正例', () => {
    it('自己改自己（MANAGER）：只改 nickname', async () => {
      const newNickname = 'manager_nickname_new';
      const res = await updateUserInfo(app, managerToken, { nickname: newNickname });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(true);
      expect(res.body.data.updateUserInfo.userInfo.nickname).toBe(newNickname);
    });

    it('自己改自己：更新登录 hint', async () => {
      const res = await updateUserInfo(app, adminToken, {
        identityHint: IdentityTypeEnum.ADMIN,
      });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(true);
      const updatedHint = await getAccountIdentityHint(dataSource, adminAccountId);
      expect(updatedHint).toBe(IdentityTypeEnum.ADMIN);
    });

    it('ADMIN 改任意人（Learner）：改 signature', async () => {
      const res = await updateUserInfo(app, adminToken, {
        accountId: learnerAccountId,
        signature: '管理员设置',
      });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(true);
      expect(res.body.data.updateUserInfo.userInfo.signature).toBe('管理员设置');
    });

    it('CUSTOMER 改名下 learner：改 phone', async () => {
      const res = await updateUserInfo(app, customerToken, {
        accountId: learnerAccountId,
        phone: '13900001111',
      });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(true);
      expect(res.body.data.updateUserInfo.userInfo.phone).toBe('13900001111');
    });

    it('COACH 改 CUSTOMER：改 address', async () => {
      const res = await updateUserInfo(app, coachToken, {
        accountId: customerAccountId,
        address: '教练可更新客户地址',
      });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(true);
      expect(res.body.data.updateUserInfo.userInfo.address).toBe('教练可更新客户地址');
    });

    it('幂等：空 patch → isUpdated=false，不写库', async () => {
      const before = await updateUserInfo(app, managerToken, {});
      expect(before.body.errors).toBeUndefined();
      const updatedAt1 = before.body.data.updateUserInfo.userInfo.updatedAt;

      const after = await updateUserInfo(app, managerToken, {});
      expect(after.body.errors).toBeUndefined();
      const updatedAt2 = after.body.data.updateUserInfo.userInfo.updatedAt;

      expect(after.body.data.updateUserInfo.isUpdated).toBe(false);
      expect(updatedAt2).toBe(updatedAt1);
    });

    it('幂等：patch 与当前值一样 → isUpdated=false', async () => {
      // 读取当前 nickname
      const readResp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          query: `query { userInfo(accountId: ${customerAccountId}) { nickname } }`,
        })
        .expect(200);
      if (readResp.body.errors)
        throw new Error(`读取用户信息失败: ${JSON.stringify(readResp.body.errors)}`);
      const currentNickname = readResp.body.data.userInfo.nickname as string;

      const res = await updateUserInfo(app, customerToken, {
        accountId: customerAccountId,
        nickname: currentNickname,
      });
      // 诊断输出：查看响应体

      console.log('E2E_DBG response (same patch):', JSON.stringify(res.body));
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.updateUserInfo.isUpdated).toBe(false);
      expect(res.body.data.updateUserInfo.userInfo.nickname).toBe(currentNickname);
    });

    it('清空字段：传 null 正确落库（email/phone/address/signature/avatarUrl）', async () => {
      const res = await updateUserInfo(app, managerToken, {
        email: null,
        phone: null,
        address: null,
        signature: null,
        avatarUrl: null,
      });
      expect(res.body.errors).toBeUndefined();
      const ui = res.body.data.updateUserInfo.userInfo as {
        email: string | null;
        phone: string | null;
        address: string | null;
        signature: string | null;
        avatarUrl: string | null;
      };
      expect(ui.email).toBeNull();
      expect(ui.phone).toBeNull();
      expect(ui.address).toBeNull();
      expect(ui.signature).toBeNull();
      expect(ui.avatarUrl).toBeNull();
    });
  });

  describe('负例', () => {
    it('纯 LEARNER 改别人（CUSTOMER）→ 拒绝', async () => {
      const res = await updateUserInfo(app, learnerToken, {
        accountId: customerAccountId,
        nickname: 'x',
      });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ACCESS_DENIED');
    });

    it('非本人修改登录 hint → 拒绝', async () => {
      const res = await updateUserInfo(app, adminToken, {
        accountId: learnerAccountId,
        identityHint: IdentityTypeEnum.LEARNER,
      });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('登录 hint 不在访问组内应报错', async () => {
      const res = await updateUserInfo(app, customerToken, {
        identityHint: IdentityTypeEnum.MANAGER,
      });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('OPERATION_NOT_SUPPORTED');
    });

    it('CUSTOMER 改其它人的 learner → 拒绝', async () => {
      const res = await updateUserInfo(app, customerToken, {
        accountId: otherLearnerAccountId,
        nickname: 'not-allowed',
      });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ACCESS_DENIED');
    });

    it('COACH 改 MANAGER → 拒绝', async () => {
      const res = await updateUserInfo(app, coachToken, {
        accountId: managerAccountId,
        nickname: 'nope',
      });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ACCESS_DENIED');
    });

    it('昵称唯一性冲突（NICKNAME_TAKEN）', async () => {
      const duplicateNickname = `${testAccountsConfig.customer.loginName}_nickname`;
      const res = await updateUserInfo(app, managerToken, { nickname: duplicateNickname });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      const gqlCode = res.body.errors?.[0]?.extensions?.code;
      expect(code).toBe('NICKNAME_TAKEN');
      expect(gqlCode).toBe('CONFLICT');
    });

    it('birthDate 格式错误（YYYY-MM-DD）', async () => {
      const res = await updateUserInfo(app, managerToken, { birthDate: '2024/01/01' });
      expect(res.body.errors).toBeDefined();
      const code = res.body.errors?.[0]?.extensions?.errorCode;
      const gqlCode = res.body.errors?.[0]?.extensions?.code;
      expect(code).toBe('OPERATION_NOT_SUPPORTED');
      expect(gqlCode).toBe('BAD_USER_INPUT');
      const msg = res.body.errors?.[0]?.message ?? '';
      expect(msg).toContain('出生日期格式必须为 YYYY-MM-DD');
    });

    it('email 长度上限 50', async () => {
      const overEmail = 'a'.repeat(51) + '@example.com';
      const r = await updateUserInfo(app, managerToken, { email: overEmail });
      expect(r.body.errors).toBeDefined();
      expect(r.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('phone 长度上限 20', async () => {
      const overPhone = '1'.repeat(21);
      const r = await updateUserInfo(app, managerToken, { phone: overPhone });
      expect(r.body.errors).toBeDefined();
      expect(r.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('address 长度上限 255', async () => {
      const overAddr = 'X'.repeat(256);
      const r = await updateUserInfo(app, managerToken, { address: overAddr });
      expect(r.body.errors).toBeDefined();
      expect(r.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('signature 长度上限 100', async () => {
      const overSign = 'S'.repeat(101);
      const r = await updateUserInfo(app, managerToken, { signature: overSign });
      expect(r.body.errors).toBeDefined();
      expect(r.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('avatarUrl 长度上限 255', async () => {
      const overAvatar = 'A'.repeat(256);
      const r = await updateUserInfo(app, managerToken, { avatarUrl: overAvatar });
      expect(r.body.errors).toBeDefined();
      expect(r.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('tags 类型不对时报错（GraphQL BAD_USER_INPUT）', async () => {
      const resp = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          query: `
            mutation Update($input: UpdateUserInfoInput!) {
              updateUserInfo(input: $input) { isUpdated }
            }
          `,
          variables: { input: { tags: 123 } },
        })
        .expect(200);
      expect(resp.body.errors).toBeDefined();
      const gqlCode = resp.body.errors?.[0]?.extensions?.code;
      expect(gqlCode).toBe('BAD_USER_INPUT');
    });
  });
});
