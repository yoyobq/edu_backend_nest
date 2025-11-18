// test/06-identity-management/identity-management.e2e-spec.ts

import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginTypeEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { TokenHelper } from '@src/core/common/token/token.helper';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 身份管理功能端到端测试
 * 测试用户升级为客户身份的 GraphQL mutation
 */
describe('IdentityManagement (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;
  let tokenHelper: TokenHelper;

  beforeAll(async () => {
    // 初始化 GraphQL Schema 以确保枚举类型正确注册
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
    tokenHelper = moduleFixture.get<TokenHelper>(TokenHelper);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * 登录用户获取 token
   */
  const loginUser = async (loginName: string, loginPassword: string): Promise<string> => {
    const response = await request(app.getHttpServer())
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
            loginName,
            loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);

    if (!response.body.data?.login?.accessToken) {
      throw new Error(`用户 ${loginName} 登录失败`);
    }

    return response.body.data.login.accessToken as string;
  };

  /**
   * 执行升级为客户身份的 GraphQL mutation
   */
  const performUpgradeToCustomer = async (input: any, token: string) => {
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation UpgradeToCustomer($input: UpgradeToCustomerInput!) {
            upgradeToCustomer(input: $input) {
              upgraded
              customerId
              accessGroup
              role
              tokens {
                accessToken
                refreshToken
              }
            }
          }
        `,
        variables: { input },
      });
  };

  /**
   * 获取当前 token 对应的 accountId
   */
  const getAccountIdFromToken = (token: string): number => {
    const payload = tokenHelper.decodeToken({ token });
    if (!payload || !payload.sub) {
      throw new Error(`无法从 JWT token 中获取 accountId: ${token.substring(0, 20)}...`);
    }
    return payload.sub;
  };

  describe('升级为客户身份', () => {
    let learnerToken: string;
    let learnerAccountId: number;

    beforeEach(async () => {
      // 清理测试数据
      await dataSource.getRepository(CustomerEntity).clear();

      // 创建测试账户
      await seedTestAccounts({
        dataSource,
        createAccountUsecase,
        includeKeys: ['learner'],
      });

      // 登录学员账户
      learnerToken = await loginUser(
        testAccountsConfig.learner.loginName,
        testAccountsConfig.learner.loginPassword,
      );

      // 获取账户 ID
      learnerAccountId = getAccountIdFromToken(learnerToken);
    });

    it('应该成功将学员升级为客户身份', async () => {
      const upgradeInput = {
        name: '测试客户',
        contactPhone: '13800138000',
        preferredContactTime: '晚上',
        remark: 'E2E 测试客户',
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await performUpgradeToCustomer(upgradeInput, learnerToken);

      // 调试输出移除

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.upgradeToCustomer).toBeDefined();

      const result = response.body.data.upgradeToCustomer;
      expect(result.upgraded).toBeDefined();
      expect(result.customerId).toBeDefined();
      expect(result.accessGroup).toBeDefined();
      expect(result.role).toBeDefined();
      expect(result.tokens).toBeDefined();

      // 验证返回值类型
      expect(typeof result.upgraded).toBe('boolean');
      expect(typeof result.customerId).toBe('number');
      expect(Array.isArray(result.accessGroup)).toBe(true);
      expect(typeof result.role).toBe('string');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('应该验证幂等性：第二次调用返回 upgraded=false 且数据一致', async () => {
      const upgradeInput = {
        name: '测试客户幂等性',
        contactPhone: '13800138001',
        preferredContactTime: '上午',
        remark: 'E2E 幂等性测试',
        audience: AudienceTypeEnum.DESKTOP,
      };

      // 第一次升级
      const firstResponse = await performUpgradeToCustomer(upgradeInput, learnerToken);
      expect(firstResponse.status).toBe(200);

      const firstResult = firstResponse.body.data.upgradeToCustomer;
      expect(firstResult.upgraded).toBe(true);
      expect(firstResult.customerId).toBeDefined();
      expect(firstResult.tokens).toBeDefined();
      expect(firstResult.tokens.accessToken).toBeDefined();
      expect(firstResult.accessGroup).toContain('CUSTOMER');

      const firstCustomerId = firstResult.customerId;

      // 第二次升级（幂等性测试）
      const secondResponse = await performUpgradeToCustomer(upgradeInput, learnerToken);
      expect(secondResponse.status).toBe(200);

      const secondResult = secondResponse.body.data.upgradeToCustomer;

      // 验证幂等性：第二次调用应返回 upgraded=false
      expect(secondResult.upgraded).toBe(false);

      // 验证 tokens 为 null（幂等分支不生成新 token）
      expect(secondResult.tokens).toBeNull();

      // 验证 accessGroup 仍包含 CUSTOMER
      expect(secondResult.accessGroup).toContain('CUSTOMER');

      // 验证 customerId 与首次一致
      expect(secondResult.customerId).toBe(firstCustomerId);

      // 验证角色决策回退路径：幂等分支时应正确决策 role
      expect(secondResult.role).toBe('CUSTOMER');
    });

    it('应该验证数据库副作用：确认客户记录正确插入', async () => {
      const upgradeInput = {
        name: '数据库测试客户',
        contactPhone: '13800138002',
        preferredContactTime: '下午',
        remark: 'E2E 数据库副作用测试',
        audience: AudienceTypeEnum.DESKTOP,
      };

      // 执行升级
      const response = await performUpgradeToCustomer(upgradeInput, learnerToken);
      expect(response.status).toBe(200);

      const result = response.body.data.upgradeToCustomer;
      expect(result.upgraded).toBe(true);
      expect(result.customerId).toBeDefined();

      // 验证数据库中的客户记录
      const customerRepository = dataSource.getRepository(CustomerEntity);
      const customerRecord = await customerRepository.findOne({
        where: { id: result.customerId },
      });

      expect(customerRecord).toBeDefined();
      expect(customerRecord!.accountId).toBe(learnerAccountId);
      expect(customerRecord!.name).toBe(upgradeInput.name);
      expect(customerRecord!.contactPhone).toBe(upgradeInput.contactPhone);
      expect(customerRecord!.preferredContactTime).toBe(upgradeInput.preferredContactTime);
      expect(customerRecord!.remark).toBe(upgradeInput.remark);
      expect(customerRecord!.createdAt).toBeDefined();
      expect(customerRecord!.updatedAt).toBeDefined();
    });

    it('应该验证 JWT 载荷：accessToken 的 aud 与 input.audience 一致且包含 CUSTOMER', async () => {
      const upgradeInput = {
        name: 'JWT 测试客户',
        contactPhone: '13800138003',
        preferredContactTime: '晚上',
        remark: 'E2E JWT 载荷测试',
        audience: AudienceTypeEnum.SJWEAPP, // 使用不同的 audience 进行测试
      };

      // 执行升级
      const response = await performUpgradeToCustomer(upgradeInput, learnerToken);
      expect(response.status).toBe(200);

      const result = response.body.data.upgradeToCustomer;
      expect(result.upgraded).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();

      // 解析 JWT 载荷
      const payload = tokenHelper.decodeToken({ token: result.tokens.accessToken });
      expect(payload).toBeDefined();

      // 验证 audience 与输入一致
      expect(payload!.aud).toBe(AudienceTypeEnum.SJWEAPP);

      // 验证 accessGroup 包含 CUSTOMER
      expect(payload!.accessGroup).toContain('CUSTOMER');

      // 验证其他基本字段
      expect(payload!.sub).toBe(learnerAccountId);
    });

    it('应该在缺少必填字段时返回验证错误', async () => {
      const invalidInput = {
        // 缺少必填的 name 字段
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await performUpgradeToCustomer(invalidInput as any, learnerToken);

      // 调试输出移除

      // GraphQL 变量验证错误返回 200 状态码，错误信息在 errors 字段中
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(response.body.errors[0].message).toContain(
        'Field "name" of required type "String!" was not provided',
      );
    });

    it('应该在无效 audience 时返回验证错误', async () => {
      const invalidInput = {
        name: '测试客户',
        audience: 'INVALID_AUDIENCE' as any,
      };

      const response = await performUpgradeToCustomer(invalidInput, learnerToken);

      // 调试输出移除

      // GraphQL 会在变量解析阶段把非法枚举拦掉，属于 BAD_USER_INPUT
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('应该在未认证时拒绝访问', async () => {
      const upgradeInput = {
        name: '测试客户',
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        // 不设置 Authorization header
        .send({
          query: `
            mutation UpgradeToCustomer($input: UpgradeToCustomerInput!) {
              upgradeToCustomer(input: $input) {
                upgraded
                customerId
                accessGroup
                role
                tokens {
                  accessToken
                  refreshToken
                }
              }
            }
          `,
          variables: {
            input: upgradeInput,
          },
        });

      // 调试输出移除

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('应该验证副作用：确认客户表插入了记录且字段正确', async () => {
      // 为此测试创建新的学习者账户
      const newLearner = await createAccountUsecase.execute({
        accountData: {
          loginName: `testlearner_db_${Date.now()}`,
          loginPassword: 'ComplexPass123!@#',
          loginEmail: `learner_db_${Date.now()}@example.com`,
          status: AccountStatus.ACTIVE,
          identityHint: IdentityTypeEnum.LEARNER,
        },
        userInfoData: {
          nickname: `testlearner_db_nickname_${Date.now()}`,
          email: `learner_db_${Date.now()}@example.com`,
          accessGroup: [IdentityTypeEnum.LEARNER],
          metaDigest: [IdentityTypeEnum.LEARNER],
          gender: Gender.SECRET,
          userState: UserState.ACTIVE,
          notifyCount: 0,
          unreadCount: 0,
        },
      });

      const newLearnerToken = await loginUser(newLearner.loginName!, 'ComplexPass123!@#');
      const newLearnerAccountId = getAccountIdFromToken(newLearnerToken);

      const customerRepository = dataSource.getRepository(CustomerEntity);

      // 升级前检查记录数
      const beforeCount = await customerRepository.count({
        where: { accountId: newLearnerAccountId },
      });
      expect(beforeCount).toBe(0);

      // 执行升级
      const upgradeInput = {
        name: '测试客户',
        contactPhone: '13800138000',
        preferredContactTime: '工作日 9-18 点',
        remark: '通过 E2E 测试创建',
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await performUpgradeToCustomer(upgradeInput, newLearnerToken);
      expect(response.status).toBe(200);
      expect(response.body.data.upgradeToCustomer.upgraded).toBe(true);

      // 升级后检查记录数
      const afterCount = await customerRepository.count({
        where: { accountId: newLearnerAccountId },
      });
      expect(afterCount).toBe(1);

      // 验证具体字段
      const customerRecord = await customerRepository.findOne({
        where: { accountId: newLearnerAccountId },
      });

      expect(customerRecord).toBeDefined();
      expect(customerRecord!.name).toBe(upgradeInput.name);
      expect(customerRecord!.contactPhone).toBe(upgradeInput.contactPhone);
      expect(customerRecord!.preferredContactTime).toBe(upgradeInput.preferredContactTime);
      expect(customerRecord!.remark).toBe(upgradeInput.remark);
      expect(customerRecord!.accountId).toBe(newLearnerAccountId);
    });

    it('应该验证 JWT 载荷：accessToken 的 aud 与 input.audience 一致', async () => {
      // 为此测试创建新的学习者账户
      const newLearner = await createAccountUsecase.execute({
        accountData: {
          loginName: `testlearner_jwt_${Date.now()}`,
          loginPassword: 'ComplexPass123!@#',
          loginEmail: `learner_jwt_${Date.now()}@example.com`,
          status: AccountStatus.ACTIVE,
          identityHint: IdentityTypeEnum.LEARNER,
        },
        userInfoData: {
          nickname: `testlearner_jwt_nickname_${Date.now()}`,
          email: `learner_jwt_${Date.now()}@example.com`,
          accessGroup: [IdentityTypeEnum.LEARNER],
          metaDigest: [IdentityTypeEnum.LEARNER],
          gender: Gender.SECRET,
          userState: UserState.ACTIVE,
          notifyCount: 0,
          unreadCount: 0,
        },
      });

      const newLearnerToken = await loginUser(newLearner.loginName!, 'ComplexPass123!@#');
      const newLearnerAccountId = getAccountIdFromToken(newLearnerToken);

      const upgradeInput = {
        name: 'JWT 测试客户',
        contactPhone: '13700137000',
        preferredContactTime: '全天',
        remark: 'JWT 测试',
        audience: AudienceTypeEnum.SJWEAPP,
      };

      const response = await performUpgradeToCustomer(upgradeInput, newLearnerToken);
      expect(response.status).toBe(200);
      expect(response.body.data.upgradeToCustomer.upgraded).toBe(true);

      const { accessToken } = response.body.data.upgradeToCustomer.tokens;

      // 解码 JWT 载荷
      const payload = tokenHelper.decodeToken({ token: accessToken });

      // 验证 audience
      expect(payload?.aud).toBe(AudienceTypeEnum.SJWEAPP);

      // 验证 accessGroup 包含 CUSTOMER
      expect(payload?.accessGroup).toContain('CUSTOMER');

      // 验证其他基本字段
      expect(payload?.sub).toBe(newLearnerAccountId);
    });

    it('应该验证角色决策回退路径：幂等分支时正确决策 role', async () => {
      // 为此测试创建新的学习者账户
      const newLearner = await createAccountUsecase.execute({
        accountData: {
          loginName: `testlearner_role_${Date.now()}`,
          loginPassword: 'ComplexPass123!@#',
          loginEmail: `learner_role_${Date.now()}@example.com`,
          status: AccountStatus.ACTIVE,
          identityHint: IdentityTypeEnum.LEARNER,
        },
        userInfoData: {
          nickname: `testlearner_role_nickname_${Date.now()}`,
          email: `learner_role_${Date.now()}@example.com`,
          accessGroup: [IdentityTypeEnum.LEARNER],
          metaDigest: [IdentityTypeEnum.LEARNER],
          gender: Gender.SECRET,
          userState: UserState.ACTIVE,
          notifyCount: 0,
          unreadCount: 0,
        },
      });

      const newLearnerToken = await loginUser(newLearner.loginName!, 'ComplexPass123!@#');

      // 先升级为客户
      const upgradeInput = {
        name: '角色决策测试客户',
        contactPhone: '13600136000',
        preferredContactTime: '工作日',
        remark: '角色决策测试',
        audience: AudienceTypeEnum.DESKTOP,
      };

      await performUpgradeToCustomer(upgradeInput, newLearnerToken);

      // 再次调用（幂等分支）
      const secondUpgradeInput = {
        name: '角色决策测试客户2',
        contactPhone: '13600136001',
        preferredContactTime: '工作日',
        remark: '角色决策测试2',
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await performUpgradeToCustomer(secondUpgradeInput, newLearnerToken);
      expect(response.status).toBe(200);

      // 验证幂等性
      expect(response.body.data.upgradeToCustomer.upgraded).toBe(false);
      expect(response.body.data.upgradeToCustomer.tokens).toBeNull();

      // 验证角色决策结果
      expect(response.body.data.upgradeToCustomer.role).toBe(IdentityTypeEnum.CUSTOMER);
      expect(response.body.data.upgradeToCustomer.accessGroup).toContain('CUSTOMER');
    });
  });
});
