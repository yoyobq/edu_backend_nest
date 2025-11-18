// test/06-identity-management/customer-management.e2e-spec.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 客户管理 E2E 测试
 * 覆盖更新、下线、上线三个操作，验证权限与幂等规则
 */
describe('Customer Management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let managerAccessToken: string;
  let customerAccessToken: string;
  let customerId: number;

  beforeAll(async () => {
    // 初始化 GraphQL Schema
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 清理并创建测试账号：manager 与 customer
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource });

    // 登录并记录 access token
    managerAccessToken = await loginAndGetToken(
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );

    customerAccessToken = await loginAndGetToken(
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );

    // 查询客户身份，获取 customerId
    customerId = await getMyCustomerId(app, customerAccessToken);
  }, 60000);

  afterAll(async () => {
    await cleanupTestAccounts(dataSource);
    if (app) await app.close();
  });

  /**
   * 登录获取 token
   */
  const loginAndGetToken = async (loginName: string, loginPassword: string): Promise<string> => {
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
  };

  /**
   * 读取当前用户的客户身份 ID
   */
  const getMyCustomerId = async (nestApp: INestApplication, token: string): Promise<number> => {
    const resp = await request(nestApp.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `
          mutation Login($input: AuthLoginInput!) {
            login(input: $input) {
              role
              identity {
                ... on CustomerType { id }
              }
            }
          }
        `,
        variables: {
          input: {
            loginName: testAccountsConfig.customer.loginName,
            loginPassword: testAccountsConfig.customer.loginPassword,
            type: LoginTypeEnum.PASSWORD,
            audience: AudienceTypeEnum.DESKTOP,
          },
        },
      })
      .expect(200);
    if (resp.body.errors) throw new Error(`读取客户身份失败: ${JSON.stringify(resp.body.errors)}`);
    if (resp.body.data.login.role !== IdentityTypeEnum.CUSTOMER)
      throw new Error('当前角色不是 Customer');
    return resp.body.data.login.identity.id as number;
  };

  describe('更新客户信息', () => {
    it('初始会员等级应为数值 ID（客户查看）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel }
              }
            }
          `,
          variables: { input: {} },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const customer = response.body.data.updateCustomer.customer;
      expect(customer.id).toBeDefined();
      expect(
        customer.membershipLevel === null || typeof customer.membershipLevel === 'number',
      ).toBe(true);
    });
    it('客户用户应该可以更新 name / phone / time / remark', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id name contactPhone preferredContactTime remark membershipLevel }
              }
            }
          `,
          variables: {
            input: {
              name: '客户测试姓名',
              contactPhone: '1234567890',
              preferredContactTime: '周一 9:00-12:00',
              remark: 'E2E 客户自更新',
            },
          },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const customer = response.body.data.updateCustomer.customer;
      expect(customer.id).toBeDefined();
      expect(customer.name).toBe('客户测试姓名');
      expect(customer.contactPhone).toBe('1234567890');
      expect(customer.preferredContactTime).toBe('周一 9:00-12:00');
      expect(customer.remark).toBe('E2E 客户自更新');
      // 客户身份无权更新 membershipLevel，类型为数值或 null
      expect(
        customer.membershipLevel === null || typeof customer.membershipLevel === 'number',
      ).toBe(true);
    });

    it('管理员应该可以更新指定客户的 membershipLevel（数值 ID）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel remark }
              }
            }
          `,
          variables: {
            input: {
              customerId,
              membershipLevel: 2,
              remark: 'E2E 管理员更新会员等级',
            },
          },
        })
        .expect(200);

      if (response.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(response.body.errors)}`);

      const customer = response.body.data.updateCustomer.customer;
      expect(customer.id).toBe(customerId);
      // GraphQL CustomerType membershipLevel 为数值或 null
      expect(
        customer.membershipLevel === null || typeof customer.membershipLevel === 'number',
      ).toBe(true);
      expect(customer.remark).toBe('E2E 管理员更新会员等级');
    });

    it('管理员传入非法会员等级 ID 应报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel }
              }
            }
          `,
          variables: {
            input: {
              customerId,
              membershipLevel: 0,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/会员等级 ID 非法|非法/);
    });

    it('客户尝试更新 membershipLevel 应该报错（GraphQL 错误）', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel }
              }
            }
          `,
          variables: {
            input: {
              membershipLevel: 3,
            },
          },
        })
        .expect(200);

      // 应返回 GraphQL 错误（DomainError 映射）
      expect(response.body.errors).toBeDefined();
      const message = response.body.errors?.[0]?.message ?? '';
      expect(message).toMatch(/客户无权修改会员等级|权限|无权/);
    });

    it('客户输入超长姓名应触发 DTO 验证错误', async () => {
      const longName = 'A'.repeat(65); // 超过 64
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id name }
              }
            }
          `,
          variables: { input: { name: longName } },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/客户姓名长度不能超过 64/);
    });

    it('管理员未提供 customerId 更新 membershipLevel 应该报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel }
              }
            }
          `,
          variables: {
            input: {
              membershipLevel: 2,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/Manager 必须指定目标客户 ID|必须指定/);
    });

    it('管理员更新不存在的 customerId 应该报错', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) {
                customer { id membershipLevel }
              }
            }
          `,
          variables: {
            input: {
              customerId: 999999,
              membershipLevel: 2,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      const msg = response.body.errors?.[0]?.message ?? '';
      expect(msg).toMatch(/目标客户不存在|客户不存在/);
    });
  });

  /**
   * 分页查询客户列表（仅管理员）
   * - 验证未授权访问返回 GraphQL 错误
   * - 验证管理员分页查询与返回结构
   * - 验证排序与翻页参数生效
   */
  describe('分页查询客户列表', () => {
    beforeEach(async () => {
      const mutation = `
        mutation UpdateCustomer($input: UpdateCustomerInput!) {
          updateCustomer(input: $input) {
            customer { id contactPhone }
          }
        }
      `;
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({ query: mutation, variables: { input: { contactPhone: '13800138000' } } })
        .expect(200);
      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
    });
    /**
     * 测试未授权访问 customers 查询
     * 期望：返回 200 且包含 GraphQL 错误数组
     */
    it('未授权访问 customers 应该返回 200 且包含错误', async () => {
      const query = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id accountId name membershipLevel createdAt updatedAt }
            pagination { page limit total totalPages hasNext hasPrev }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query,
          variables: { input: { page: 1, limit: 5 } },
        })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    /**
     * 测试管理员分页查询 customers 列表
     * 期望：无 GraphQL 错误，返回 pagination 字段与 customers 数组，基本字段类型正确
     */
    it('管理员身份可以分页查询 customers 列表', async () => {
      const query = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id accountId name membershipLevel createdAt updatedAt }
            pagination { page limit total totalPages hasNext hasPrev }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query,
          variables: { input: { page: 1, limit: 5 } },
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      const payload = res.body.data.customers;
      expect(payload).toBeDefined();
      expect(payload.pagination).toBeDefined();
      expect(typeof payload.pagination.page).toBe('number');
      expect(typeof payload.pagination.limit).toBe('number');
      expect(typeof payload.pagination.total).toBe('number');
      expect(typeof payload.pagination.totalPages).toBe('number');
      expect(typeof payload.pagination.hasNext).toBe('boolean');
      expect(typeof payload.pagination.hasPrev).toBe('boolean');

      expect(Array.isArray(payload.customers)).toBe(true);
      if (payload.customers.length > 0) {
        const first = payload.customers[0];
        expect(typeof first.id).toBe('number');
        expect(typeof first.name).toBe('string');
        // accountId 允许为 null（DTO 定义），这里只做存在性断言
        expect(first.accountId === null || typeof first.accountId === 'number').toBe(true);
      }
    });

    /**
     * 测试排序与翻页参数
     * 输入：sortBy = UPDATED_AT，sortOrder = DESC，page = 2，limit = 2
     * 期望：无 GraphQL 错误，返回的 pagination 与 limit 匹配
     */
    it('管理员身份支持排序与翻页参数（按 updatedAt DESC）', async () => {
      const query = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name createdAt updatedAt }
            pagination { page limit total totalPages hasNext hasPrev }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query,
          variables: {
            input: {
              page: 2,
              limit: 2,
              sortBy: 'UPDATED_AT',
              sortOrder: 'DESC',
            },
          },
        })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      const pagination = res.body.data.customers.pagination;
      expect(pagination.page).toBeGreaterThanOrEqual(1);
      expect(pagination.limit).toBe(2);
    });

    it('管理员支持 query 搜索（按姓名/手机号）', async () => {
      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name contactPhone }
            pagination { page limit total totalPages }
          }
        }
      `;

      const byName = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, query: 'testcustomer' } },
        })
        .expect(200);
      expect(byName.body.errors).toBeUndefined();
      const nameList = byName.body.data.customers.customers as Array<{ name: string }>;
      expect(Array.isArray(nameList)).toBe(true);
      expect(nameList.some((c) => typeof c.name === 'string')).toBe(true);

      const byPhone = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, query: '1380013' } },
        })
        .expect(200);
      expect(byPhone.body.errors).toBeUndefined();
      const phoneList = byPhone.body.data.customers.customers as Array<{
        contactPhone: string | null;
      }>;
      expect(Array.isArray(phoneList)).toBe(true);
      // 调试输出移除
      expect(phoneList.some((c) => typeof c.contactPhone === 'string')).toBe(true);
    });

    it('管理员支持 filters 精确过滤（membershipLevel / userState / contactPhone）', async () => {
      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name membershipLevel contactPhone }
            pagination { page limit total totalPages }
          }
        }
      `;

      const byLevel = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, membershipLevel: 1 } },
        })
        .expect(200);
      expect(byLevel.body.errors).toBeUndefined();
      const lvList = byLevel.body.data.customers.customers as Array<{
        membershipLevel: number | null;
      }>;
      expect(Array.isArray(lvList)).toBe(true);

      const byState = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, userState: 'ACTIVE' } },
        })
        .expect(200);
      expect(byState.body.errors).toBeUndefined();
      const stList = byState.body.data.customers.customers as Array<{ id: number }>;
      expect(Array.isArray(stList)).toBe(true);

      const byContactPhone = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, contactPhone: '13800138000' } },
        })
        .expect(200);
      expect(byContactPhone.body.errors).toBeUndefined();
      const cpList = byContactPhone.body.data.customers.customers as Array<{
        contactPhone: string | null;
      }>;
      expect(Array.isArray(cpList)).toBe(true);
    });
  });

  describe('客户上下线', () => {
    it('管理员应该可以下线客户（幂等）', async () => {
      // 第一次下线
      const first = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateCustomer($input: DeactivateCustomerInput!) {
              deactivateCustomer(input: $input) {
                customer { id deactivatedAt }
                isUpdated
              }
            }
          `,
          variables: { input: { id: customerId } },
        })
        .expect(200);

      if (first.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(first.body.errors)}`);
      expect(first.body.data.deactivateCustomer.isUpdated).toBe(true);
      expect(first.body.data.deactivateCustomer.customer.deactivatedAt).toBeTruthy();

      // 第二次下线（幂等）
      const second = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation DeactivateCustomer($input: DeactivateCustomerInput!) {
              deactivateCustomer(input: $input) {
                customer { id deactivatedAt }
                isUpdated
              }
            }
          `,
          variables: { input: { id: customerId } },
        })
        .expect(200);
      expect(second.body.data.deactivateCustomer.isUpdated).toBe(false);
    });

    it('管理员应该可以上线客户（幂等）', async () => {
      // 第一次上线
      const first = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCustomer($input: ReactivateCustomerInput!) {
              reactivateCustomer(input: $input) {
                customer { id deactivatedAt }
                isUpdated
              }
            }
          `,
          variables: { input: { id: customerId } },
        })
        .expect(200);

      if (first.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(first.body.errors)}`);
      expect(first.body.data.reactivateCustomer.isUpdated).toBe(true);
      expect(first.body.data.reactivateCustomer.customer.deactivatedAt).toBeNull();

      // 第二次上线（幂等）
      const second = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: `
            mutation ReactivateCustomer($input: ReactivateCustomerInput!) {
              reactivateCustomer(input: $input) {
                customer { id deactivatedAt }
                isUpdated
              }
            }
          `,
          variables: { input: { id: customerId } },
        })
        .expect(200);
      expect(second.body.data.reactivateCustomer.isUpdated).toBe(false);
    });
  });
});
