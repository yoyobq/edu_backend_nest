// test/07-pagination/learners-pagination.e2e-spec.ts
import { AudienceTypeEnum, LoginTypeEnum } from '@app-types/models/account.types';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Learners Pagination (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let learnerService: LearnerService;

  let customerToken: string;
  let managerToken: string;

  // CURSOR 分页测试专用数据
  const CURSOR_TEST_CUSTOMER_ID = 777701;
  const CURSOR_NAME_PREFIX = 'LC';

  beforeAll(async () => {
    // 初始化 GraphQL Schema（注册枚举/类型）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    learnerService = moduleFixture.get<LearnerService>(LearnerService);

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
    try {
      // 清理 CURSOR 分页测试数据
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(LearnerEntity)
        .where('customer_id = :cid', { cid: CURSOR_TEST_CUSTOMER_ID })
        .execute();
    } finally {
      await app.close();
    }
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

  // ========== CURSOR 分页测试（内部接口） ==========
  describe('CURSOR 分页（内部接口）', () => {
    beforeAll(async () => {
      // 为 CURSOR 测试创建专用数据
      await seedCursorTestLearners(30);
    });

    it('CURSOR 分页 - ASC 排序（name 主键，id 辅助）', async () => {
      const result = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 5,
      });

      expect(result.items).toHaveLength(5);
      expect(result.pageInfo?.hasNext).toBe(true);
      expect(result.pageInfo?.nextCursor).toBeDefined();

      // 验证排序：name ASC, id ASC
      const names = result.items.map((item) => item.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('CURSOR 分页 - DESC 排序（name 主键，id 辅助）', async () => {
      const result = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 5,
        sorts: [
          { field: 'name', direction: 'DESC' },
          { field: 'id', direction: 'DESC' },
        ],
      });

      expect(result.items).toHaveLength(5);
      expect(result.pageInfo?.hasNext).toBe(true);

      // 验证排序：name DESC, id DESC
      const names = result.items.map((item) => item.name);
      const sortedNames = [...names].sort().reverse();
      expect(names).toEqual(sortedNames);
    });

    it('CURSOR 分页 - 使用 cursor 翻页', async () => {
      // 第一页
      const firstPage = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 3,
      });

      expect(firstPage.items).toHaveLength(3);
      expect(firstPage.pageInfo?.hasNext).toBe(true);

      // 第二页
      const secondPage = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 3,
        after: firstPage.pageInfo?.nextCursor,
      });

      expect(secondPage.items).toHaveLength(3);

      // 验证数据不重复
      const firstPageIds = firstPage.items.map((item) => item.id);
      const secondPageIds = secondPage.items.map((item) => item.id);
      const intersection = firstPageIds.filter((id) => secondPageIds.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('CURSOR 分页 - 使用 before 回退上一页（name ASC, id ASC）', async () => {
      // 先前进到第二页
      const firstPage = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 5,
      });

      const secondPage = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 5,
        after: firstPage.pageInfo?.nextCursor,
      });

      expect(secondPage.items).toHaveLength(5);
      let beforeCursor = secondPage.pageInfo?.prevCursor;

      // 若未提供 prevCursor，则基于第二页首项构造 before 游标
      if (!beforeCursor) {
        const signer = app.get<ICursorSigner>(PAGINATION_TOKENS.CURSOR_SIGNER);
        const firstOfSecond = secondPage.items[0];
        beforeCursor = signer.sign({
          key: 'name',
          primaryValue: firstOfSecond.name,
          tieValue: firstOfSecond.id,
        });
      }

      const prevPage = await learnerService.findCursorPage({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        limit: 5,
        before: beforeCursor,
      });

      expect(prevPage.items).toHaveLength(5);
      // 回退后应与第一页的 name 列相等（有序）
      const namesPrev = prevPage.items.map((x) => x.name);
      const namesFirst = firstPage.items.map((x) => x.name);
      expect(namesPrev).toEqual(namesFirst);
    });
  });

  // ========== 辅助方法 ==========

  /**
   * 为 CURSOR 分页测试创建专用的 Learner 数据
   */
  async function seedCursorTestLearners(count: number): Promise<void> {
    // 先清理可能存在的数据
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(LearnerEntity)
      .where('customer_id = :cid', { cid: CURSOR_TEST_CUSTOMER_ID })
      .execute();

    // 创建测试数据
    const learners: Partial<LearnerEntity>[] = [];
    for (let i = 0; i < count; i++) {
      learners.push({
        customerId: CURSOR_TEST_CUSTOMER_ID,
        name: `${CURSOR_NAME_PREFIX}${i.toString().padStart(2, '0')}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await dataSource.getRepository(LearnerEntity).save(learners);
  }

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
