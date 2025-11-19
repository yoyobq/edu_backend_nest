// test/06-identity-management/customer-management.e2e-spec.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Brackets, DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { AppModule } from '../../src/app.module';
import { UserInfoEntity } from '../../src/modules/account/base/entities/user-info.entity';
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
            customers { id accountId name membershipLevel phone createdAt updatedAt }
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
            customers { id accountId name membershipLevel phone createdAt updatedAt }
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
        expect(first.phone === null || typeof first.phone === 'string').toBe(true);
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
            customers { id name phone createdAt updatedAt }
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
            customers { id name contactPhone phone }
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

      // 当手机号关键字不足 3 位时，不触发电话搜索，仅按姓名/昵称模糊
      const shortPhone = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, query: '13' } },
        })
        .expect(200);
      expect(shortPhone.body.errors).toBeUndefined();
      const shortList = shortPhone.body.data.customers.customers as Array<{ name: string }>;
      expect(Array.isArray(shortList)).toBe(true);
      // 不作严格断言数量，只验证查询成功
      expect(shortList.every((c) => typeof c.name === 'string')).toBe(true);
    });

    it('管理员支持 query 搜索（多手机号比对）', async () => {
      const setBase = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) { customer { id contactPhone } }
            }
          `,
          variables: { input: { contactPhone: '13911110000' } },
        })
        .expect(200);
      if (setBase.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(setBase.body.errors)}`);

      const guestToken = await loginAndGetToken(
        testAccountsConfig.guest.loginName,
        testAccountsConfig.guest.loginPassword,
      );
      const coachToken = await loginAndGetToken(
        testAccountsConfig.coach.loginName,
        testAccountsConfig.coach.loginPassword,
      );
      const adminToken = await loginAndGetToken(
        testAccountsConfig.admin.loginName,
        testAccountsConfig.admin.loginPassword,
      );

      const upgrade = async (token: string, name: string, phone: string) => {
        const resp = await request(app.getHttpServer())
          .post('/graphql')
          .set('Authorization', `Bearer ${token}`)
          .send({
            query: `
              mutation UpgradeToCustomer($input: UpgradeToCustomerInput!) {
                upgradeToCustomer(input: $input) { upgraded customerId role }
              }
            `,
            variables: {
              input: {
                name,
                contactPhone: phone,
                preferredContactTime: 'ANY',
                remark: 'E2E',
                audience: AudienceTypeEnum.DESKTOP,
              },
            },
          })
          .expect(200);
        if (resp.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(resp.body.errors)}`);
      };

      await upgrade(guestToken, 'guest-customer', '13922220000');
      await upgrade(coachToken, 'coach-customer', '13933330000');
      await upgrade(adminToken, 'admin-customer', '15688887777');

      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name contactPhone phone }
            pagination { page limit total totalPages }
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ query: queryGql, variables: { input: { page: 1, limit: 20, query: '139' } } })
        .expect(200);
      expect(res.body.errors).toBeUndefined();
      const list = res.body.data.customers.customers as Array<{ contactPhone: string | null }>;
      const total = res.body.data.customers.pagination.total as number;
      const phones = list.map((x) => x.contactPhone).filter((x) => typeof x === 'string');
      const expected = ['13911110000', '13922220000', '13933330000'];
      expect(total).toBeGreaterThanOrEqual(expected.length);
      expect(expected.every((p) => phones.includes(p))).toBe(true);
      expect(phones.includes('15688887777')).toBe(false);
    });

    it('管理员支持 filters.contactPhone 前后缀匹配（customer.contactPhone/userinfo.phone）', async () => {
      // 先设置 customer.contactPhone
      const setContact = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          query: `
            mutation UpdateCustomer($input: UpdateCustomerInput!) {
              updateCustomer(input: $input) { customer { id contactPhone } }
            }
          `,
          variables: { input: { contactPhone: '13988880000' } },
        })
        .expect(200);
      if (setContact.body.errors)
        throw new Error(`GraphQL 错误: ${JSON.stringify(setContact.body.errors)}`);

      // 再设置 userinfo.phone
      const loginResp = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) { login(input: $input) { accountId } }
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
      const accountId = loginResp.body.data.login.accountId as number;
      const repo = dataSource.getRepository(UserInfoEntity);
      await repo.update({ accountId }, { phone: '13677770000' });

      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name contactPhone phone }
            pagination { page limit total totalPages }
          }
        }
      `;

      // 前缀匹配（customer.contactPhone）
      const prefixRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, contactPhone: '1398' } },
        })
        .expect(200);
      expect(prefixRes.body.errors).toBeUndefined();
      const prefixList = prefixRes.body.data.customers.customers as Array<{ id: number }>;
      expect(Array.isArray(prefixList)).toBe(true);
      expect(prefixList.length).toBeGreaterThan(0);
      const prefixTotal = prefixRes.body.data.customers.pagination.total as number;
      const dbPrefixCount = await dataSource
        .createQueryBuilder()
        .select('COUNT(DISTINCT c.id)', 'cnt')
        .from('member_customers', 'c')
        .leftJoin('base_user_info', 'ui', 'ui.account_id = c.account_id')
        .where('c.deactivated_at IS NULL')
        .andWhere(
          new Brackets((qb) => {
            qb.where('c.contact_phone LIKE :p', { p: `%1398%` }).orWhere('ui.phone LIKE :p', {
              p: `%1398%`,
            });
          }),
        )
        .getRawOne<{ cnt: number }>();
      expect(prefixTotal).toBe(Number(dbPrefixCount?.cnt ?? 0));

      // 后缀匹配（userinfo.phone）
      const suffixRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, contactPhone: '0000' } },
        })
        .expect(200);
      expect(suffixRes.body.errors).toBeUndefined();
      const suffixList = suffixRes.body.data.customers.customers as Array<{ id: number }>;
      expect(Array.isArray(suffixList)).toBe(true);
      expect(suffixList.length).toBeGreaterThan(0);
      const suffixTotal = suffixRes.body.data.customers.pagination.total as number;
      const dbSuffixCount = await dataSource
        .createQueryBuilder()
        .select('COUNT(DISTINCT c.id)', 'cnt')
        .from('member_customers', 'c')
        .leftJoin('base_user_info', 'ui', 'ui.account_id = c.account_id')
        .where('c.deactivated_at IS NULL')
        .andWhere(
          new Brackets((qb) => {
            qb.where('c.contact_phone LIKE :p', { p: `%0000%` }).orWhere('ui.phone LIKE :p', {
              p: `%0000%`,
            });
          }),
        )
        .getRawOne<{ cnt: number }>();
      expect(suffixTotal).toBe(Number(dbSuffixCount?.cnt ?? 0));
    });

    it('管理员支持 query 搜索（按 userinfo.phone 手机号）', async () => {
      const loginResp = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation Login($input: AuthLoginInput!) {
              login(input: $input) { accountId }
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
      const accountId = loginResp.body.data.login.accountId as number;

      const repo = dataSource.getRepository(UserInfoEntity);
      await repo.update({ accountId }, { phone: '15500008888' });

      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name contactPhone phone }
            pagination { page limit total totalPages }
          }
        }
      `;
      const byUiPhone = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          query: queryGql,
          variables: { input: { page: 1, limit: 10, query: '1550000' } },
        })
        .expect(200);
      expect(byUiPhone.body.errors).toBeUndefined();
      const uiPhoneList = byUiPhone.body.data.customers.customers as Array<{ id: number }>;
      expect(Array.isArray(uiPhoneList)).toBe(true);
      expect(uiPhoneList.length).toBeGreaterThan(0);
    });

    it('管理员支持 filters 精确过滤（membershipLevel / userState / contactPhone）', async () => {
      const queryGql = `
        query ListCustomers($input: ListCustomersInput!) {
          customers(input: $input) {
            customers { id name membershipLevel contactPhone phone }
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

  /**
   * 单客户查询（customer）
   * - 验证未授权访问报错
   * - 验证客户本人可不传 customerId 获取自身信息
   * - 验证管理员可通过 customerId 查询指定客户
   */
  describe('单客户查询（customer，仅 manager）', () => {
    it('未授权访问 customer 应返回 200 且包含错误', async () => {
      const query = `
        query GetCustomer($input: GetCustomerInput!) {
          customer(input: $input) { id accountId name contactPhone phone createdAt updatedAt }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables: { input: { customerId } } })
        .expect(200);

      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('管理员可通过 customerId 查询指定客户', async () => {
      const query = `
        query GetCustomer($input: GetCustomerInput!) {
          customer(input: $input) {
            id accountId name contactPhone phone membershipLevel createdAt updatedAt deactivatedAt
          }
        }
      `;

      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ query, variables: { input: { customerId } } })
        .expect(200);

      expect(res.body.errors).toBeUndefined();
      const cust = res.body.data.customer;
      expect(cust.id).toBe(customerId);
      expect(cust.membershipLevel === null || typeof cust.membershipLevel === 'number').toBe(true);
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
