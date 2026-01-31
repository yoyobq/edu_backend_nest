// 文件位置：/var/www/backend/test/08-integration-events/session-series-list.e2e-spec.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ParticipationEnrollmentEntity } from '@src/modules/participation/enrollment/participation-enrollment.entity';
import { ParticipationEnrollmentStatus } from '@src/types/models/participation-enrollment.types';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import {
  executeGql as executeGqlUtils,
  getAccountIdByLoginName,
  getCoachIdByAccountId,
  getLearnerIdByAccountId,
  getManagerIdByAccountId,
  login as loginUtils,
} from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 以指定 token 执行 GraphQL 查询或变更
 * @param app Nest 应用实例
 * @param query GraphQL 查询字符串
 * @param token 可选访问令牌
 * @returns supertest 请求对象
 */
function executeGql(
  app: INestApplication,
  query: string,
  token?: string,
): ReturnType<typeof executeGqlUtils> {
  return executeGqlUtils({ app, query, token });
}

/**
 * 使用账号密码登录并返回 accessToken
 * @param app Nest 应用实例
 * @param loginName 登录名
 * @param loginPassword 登录密码
 * @returns accessToken 字符串
 */
async function login(
  app: INestApplication,
  loginName: string,
  loginPassword: string,
): Promise<string> {
  return await loginUtils({ app, loginName, loginPassword });
}

/**
 * 确保存在一个测试课程目录并返回其 ID
 * @param ds 数据源
 * @returns 课程目录 ID
 */
async function ensureTestCatalog(ds: DataSource): Promise<number> {
  const repo = ds.getRepository(CourseCatalogEntity);
  const level: CourseLevel = CourseLevel.FITNESS;
  const existed = await repo.findOne({ where: { courseLevel: level } });
  if (existed) {
    await repo.update(existed.id, {
      title: '体能课程（列表测试）',
      description: 'E2E 列表测试课程目录',
      deactivatedAt: null,
    });
    return existed.id;
  }
  const created = await repo.save(
    repo.create({
      courseLevel: level,
      title: '体能课程（列表测试）',
      description: 'E2E 列表测试课程目录',
      deactivatedAt: null,
      createdBy: null,
      updatedBy: null,
    } as CourseCatalogEntity),
  );
  return Number(created.id);
}

/**
 * 创建测试开课班并返回其 ID
 * @param ds 数据源
 * @param catalogId 课程目录 ID
 * @param publisherManagerId 经理 ID
 * @returns 开课班 ID
 */
async function createTestSeries(
  ds: DataSource,
  catalogId: number,
  publisherManagerId: number,
): Promise<number> {
  const repo = ds.getRepository(CourseSeriesEntity);
  const now = new Date();
  const start = new Date(now.getTime() + 24 * 3600 * 1000);
  const end = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
  const created = await repo.save(
    repo.create({
      catalogId,
      publisherType: PublisherType.MANAGER,
      publisherId: publisherManagerId,
      title: `E2E 列表开课班 ${Date.now()}`,
      description: '报名与节次列表测试开课班',
      venueType: VenueType.SANDA_GYM,
      classMode: ClassMode.SMALL_CLASS,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      recurrenceRule: null,
      leaveCutoffHours: 12,
      pricePerSession: '100.00',
      teachingFeeRef: '80.00',
      maxLearners: 8,
      status: CourseSeriesStatus.PUBLISHED,
      remark: 'E2E 列表测试开课班',
      createdBy: null,
      updatedBy: null,
    }),
  );
  return Number(created.id);
}

/**
 * 创建测试节次并返回其 ID
 * @param ds 数据源
 * @param params 节次创建参数
 * @returns 节次 ID
 */
async function createTestSession(
  ds: DataSource,
  params: {
    readonly seriesId: number;
    readonly leadCoachId: number;
    readonly startOffsetMinutes?: number;
  },
): Promise<number> {
  const repo = ds.getRepository(CourseSessionEntity);
  const start = new Date(Date.now() + (params.startOffsetMinutes ?? 60) * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await repo.save(
    repo.create({
      seriesId: params.seriesId,
      startTime: start,
      endTime: end,
      leadCoachId: params.leadCoachId,
      locationText: '散打馆 B1 教室',
      extraCoachesJson: null,
      remark: 'E2E 列表测试节次',
      createdBy: null,
      updatedBy: null,
    }),
  );
  return created.id;
}

describe('Session/Series Lists (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let customerToken: string;
  let managerToken: string;
  let seriesId: number;
  let sessionId: number;
  let learnerId: number;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: null,
      includeKeys: ['manager', 'coach', 'customer', 'learner'],
    });

    customerToken = await login(
      app,
      testAccountsConfig.customer.loginName,
      testAccountsConfig.customer.loginPassword,
    );
    managerToken = await login(
      app,
      testAccountsConfig.manager.loginName,
      testAccountsConfig.manager.loginPassword,
    );

    const catalogId = await ensureTestCatalog(dataSource);
    const managerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.manager.loginName,
    );
    const managerId = await getManagerIdByAccountId(dataSource, managerAccountId);
    seriesId = await createTestSeries(dataSource, catalogId, managerId);

    const coachAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.coach.loginName,
    );
    const coachId = await getCoachIdByAccountId(dataSource, coachAccountId);
    sessionId = await createTestSession(dataSource, { seriesId, leadCoachId: coachId });

    const learnerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.learner.loginName,
    );
    learnerId = await getLearnerIdByAccountId(dataSource, learnerAccountId);

    const customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.customer.loginName,
    );
    const customerService = app.get<CustomerService>(CustomerService);
    const customer = await customerService.findByAccountId(customerAccountId);
    if (!customer) throw new Error('测试前置失败：未找到 Customer 身份');
  }, 30000);

  afterAll(async () => {
    try {
      await dataSource.getRepository(ParticipationEnrollmentEntity).delete({
        sessionId,
        learnerId,
      });
      await dataSource.getRepository(CourseSessionEntity).delete({ id: sessionId });
      await dataSource.getRepository(CourseSeriesEntity).delete({ id: seriesId });
      await cleanupTestAccounts(dataSource);
    } finally {
      if (app) await app.close();
    }
  });

  beforeEach(async () => {
    await dataSource.getRepository(ParticipationEnrollmentEntity).delete({
      sessionId,
      learnerId,
    });
  });

  it('查询节次报名列表', async () => {
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 列表报名" }) {
          isNewlyCreated
        }
      }
    `;
    await executeGql(app, mutation, customerToken).expect(200);

    const query = `
      query {
        listSessionEnrollments(input: { sessionId: ${sessionId} }) {
          id
          sessionId
          learnerId
          customerId
          status
          statusReason
          remark
        }
      }
    `;
    const res = await executeGql(app, query, managerToken).expect(200);
    const body = res.body as unknown as {
      data?: { listSessionEnrollments?: Array<{ sessionId: number; learnerId: number }> };
      errors?: unknown;
    };
    if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
    const items = body.data?.listSessionEnrollments ?? [];
    const hit = items.find((item) => item.sessionId === sessionId && item.learnerId === learnerId);
    expect(hit).toBeTruthy();
  });

  it('查询学员在开课班的已报名节次 ID 列表', async () => {
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E series 列表报名" }) {
          isNewlyCreated
        }
      }
    `;
    await executeGql(app, mutation, customerToken).expect(200);

    const query = `
      query {
        listLearnerEnrolledSessionIdsBySeries(input: { seriesId: ${seriesId}, learnerId: ${learnerId} }) {
          sessionIds
        }
      }
    `;
    const res = await executeGql(app, query, customerToken).expect(200);
    const body = res.body as unknown as {
      data?: { listLearnerEnrolledSessionIdsBySeries?: { sessionIds: number[] } };
      errors?: unknown;
    };
    if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
    const ids = body.data?.listLearnerEnrolledSessionIdsBySeries?.sessionIds ?? [];
    expect(ids).toContain(sessionId);
  });

  it('查询开课班节次列表（customer 安全视图）', async () => {
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E customer 视图报名" }) {
          isNewlyCreated
        }
      }
    `;
    await executeGql(app, mutation, customerToken).expect(200);

    const baseTime = new Date().toISOString();
    const query = `
      query {
        customerCourseSessionsBySeries(input: { seriesId: ${seriesId}, mode: "RECENT_WINDOW", baseTime: "${baseTime}", pastLimit: 1, futureLimit: 3 }) {
          items { id seriesId }
        }
      }
    `;
    const res = await executeGql(app, query, customerToken).expect(200);
    const body = res.body as unknown as {
      data?: {
        customerCourseSessionsBySeries?: { items?: Array<{ id: number; seriesId: number }> };
      };
      errors?: unknown;
    };
    if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
    const items = body.data?.customerCourseSessionsBySeries?.items ?? [];
    const hit = items.find(
      (item) => Number(item.id) === sessionId && Number(item.seriesId) === seriesId,
    );
    expect(hit).toBeTruthy();
  });

  /**
   * 查询当前账号名下已报名的开课班 ID 列表
   */
  it('查询当前账号名下已报名的开课班 ID 列表', async () => {
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E account series ids" }) {
          isNewlyCreated
        }
      }
    `;
    await executeGql(app, mutation, customerToken).expect(200);

    const query = `
      query {
        listCurrentAccountEnrolledSeriesIds {
          seriesIds
        }
      }
    `;
    const res = await executeGql(app, query, customerToken).expect(200);
    const body = res.body as unknown as {
      data?: { listCurrentAccountEnrolledSeriesIds?: { seriesIds: number[] } };
      errors?: unknown;
    };
    if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
    const seriesIds = body.data?.listCurrentAccountEnrolledSeriesIds?.seriesIds ?? [];
    expect(seriesIds).toContain(seriesId);
  });

  /**
   * 查询当前账号名下已报名的节次 ID 列表
   */
  it('查询当前账号名下已报名的节次 ID 列表', async () => {
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E account session ids" }) {
          isNewlyCreated
        }
      }
    `;
    await executeGql(app, mutation, customerToken).expect(200);

    const query = `
      query {
        listCurrentAccountEnrolledSessions {
          sessionIds
          enrollments { sessionId learnerId learnerName status statusReason }
        }
      }
    `;
    const res = await executeGql(app, query, customerToken).expect(200);
    const body = res.body as unknown as {
      data?: {
        listCurrentAccountEnrolledSessions?: {
          sessionIds: number[];
          enrollments: Array<{
            sessionId: number;
            learnerId: number;
            learnerName: string;
            status: ParticipationEnrollmentStatus;
            statusReason: string | null;
          }>;
        };
      };
      errors?: unknown;
    };
    if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
    const sessionIds = body.data?.listCurrentAccountEnrolledSessions?.sessionIds ?? [];
    const items = body.data?.listCurrentAccountEnrolledSessions?.enrollments ?? [];
    const learner = await dataSource
      .getRepository(LearnerEntity)
      .findOne({ where: { id: learnerId } });
    if (!learner) throw new Error('E2E 预期的 learner 记录不存在');
    const hit = items.find(
      (item) => Number(item.sessionId) === sessionId && Number(item.learnerId) === learnerId,
    );
    expect(sessionIds).toContain(sessionId);
    expect(hit).toBeTruthy();
    expect(hit?.learnerName).toBe(learner.name);
    expect(hit?.status).toBe(ParticipationEnrollmentStatus.ENROLLED);
    expect(hit?.statusReason ?? null).toBeNull();
  });
});
