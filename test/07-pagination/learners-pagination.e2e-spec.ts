// test/07-pagination/learners-pagination.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Learners Pagination (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let customerToken: string;
  let managerToken: string;

  beforeAll(async () => {
    // 初始化 GraphQL Schema（注册枚举/类型）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // 播种测试账号（至少 customer / manager）
    const createAccountUsecase = moduleFixture.get<CreateAccountUsecase>(CreateAccountUsecase);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase,
      includeKeys: ['customer', 'manager'],
    });

    // 登录以获取 token
    customerToken = await loginAndGetToken(
      app,
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );
    managerToken = await loginAndGetToken(
      app,
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('未授权访问 learners 应该返回 200 且包含错误', async () => {
    const query = `
      query ListLearners($input: ListLearnersInput!) {
        learners(input: $input) {
          learners { id name customerId createdAt updatedAt }
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

    // GraphQL 会返回 200，但 errors 字段应存在（JwtAuthGuard 拦截）
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('客户身份可以分页查询自己的学员列表', async () => {
    const query = `
      query ListLearners($input: ListLearnersInput!) {
        learners(input: $input) {
          learners { id name customerId createdAt updatedAt }
          pagination { page limit total totalPages hasNext hasPrev }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        query,
        variables: { input: { page: 1, limit: 5 } },
      })
      .expect(200);

    // 不应有 GraphQL 错误
    expect(res.body.errors).toBeUndefined();

    // 响应结构断言
    const payload = res.body.data.learners;
    expect(payload).toBeDefined();
    expect(payload.pagination).toBeDefined();
    expect(typeof payload.pagination.page).toBe('number');
    expect(typeof payload.pagination.limit).toBe('number');
    expect(typeof payload.pagination.total).toBe('number');
    expect(typeof payload.pagination.totalPages).toBe('number');
    expect(typeof payload.pagination.hasNext).toBe('boolean');
    expect(typeof payload.pagination.hasPrev).toBe('boolean');

    // items 断言
    expect(Array.isArray(payload.learners)).toBe(true);
    if (payload.learners.length > 0) {
      const first = payload.learners[0];
      expect(typeof first.id).toBe('number');
      expect(typeof first.name).toBe('string');
      expect(typeof first.customerId).toBe('number');
    }
  });

  it('客户身份支持排序与翻页参数', async () => {
    const query = `
      query ListLearners($input: ListLearnersInput!) {
        learners(input: $input) {
          learners { id name customerId createdAt updatedAt }
          pagination { page limit total totalPages hasNext hasPrev }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${customerToken}`)
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
    const pagination = res.body.data.learners.pagination;
    expect(pagination.page).toBeGreaterThanOrEqual(1);
    expect(pagination.limit).toBe(2);
  });

  it('管理员身份可以访问 learners（不限定 customerId）', async () => {
    const query = `
      query ListLearners($input: ListLearnersInput!) {
        learners(input: $input) {
          learners { id name customerId }
          pagination { page limit total totalPages }
        }
      }
    `;

    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        query,
        variables: { input: { page: 1, limit: 5 } },
      })
      .expect(200);

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.learners).toBeDefined();
    expect(Array.isArray(res.body.data.learners.learners)).toBe(true);
  });

  // 登录辅助方法
  async function loginAndGetToken(
    app: INestApplication,
    loginName: string,
    loginPassword: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
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

    return response.body.data.login.accessToken as string;
  }
});
