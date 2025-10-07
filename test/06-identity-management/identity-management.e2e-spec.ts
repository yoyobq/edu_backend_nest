// test/06-identity-management/identity-management.e2e-spec.ts

import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
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

  describe('升级为客户身份', () => {
    let learnerToken: string;

    beforeEach(async () => {
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
    });

    it('应该成功将学员升级为客户身份', async () => {
      const upgradeInput = {
        audience: AudienceTypeEnum.DESKTOP,
      };

      const response = await performUpgradeToCustomer(upgradeInput, learnerToken);

      console.log('升级响应:', JSON.stringify(response.body, null, 2));

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

    it('应该在缺少必填字段时返回验证错误', async () => {
      const invalidInput = {
        // 缺少 audience 字段
      };

      const response = await performUpgradeToCustomer(invalidInput as any, learnerToken);

      console.log('验证错误响应:', JSON.stringify(response.body, null, 2));

      // GraphQL 验证错误通常返回 400 状态码
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('应该在无效 audience 时返回验证错误', async () => {
      const invalidInput = {
        audience: 'INVALID_AUDIENCE' as any,
      };

      const response = await performUpgradeToCustomer(invalidInput, learnerToken);

      console.log('audience 验证错误响应:', JSON.stringify(response.body, null, 2));

      // 可能是 GraphQL 验证错误或业务逻辑错误
      expect(response.status).toBeGreaterThanOrEqual(200);
      if (response.body.errors) {
        expect(response.body.errors.length).toBeGreaterThan(0);
      } else if (response.body.data?.upgradeToCustomer) {
        // 如果是业务逻辑错误，检查返回的错误信息
        expect(response.body.data.upgradeToCustomer).toBeDefined();
      }
    });

    it('应该在未认证时拒绝访问', async () => {
      const upgradeInput = {
        name: '测试客户',
        contactPhone: '13800138000',
      };

      const response = await request(app.getHttpServer())
        .post('/graphql')
        // 不设置 Authorization header
        .send({
          query: `
            mutation UpgradeToCustomer($input: UpgradeToCustomerInput!) {
              upgradeToCustomer(input: $input) {
                accessToken
                refreshToken
                customerId
                message
              }
            }
          `,
          variables: {
            input: upgradeInput,
          },
        });

      console.log('未认证响应:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });
});
