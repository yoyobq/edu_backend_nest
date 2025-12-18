// test/04-course/course-sessions-by-series.e2e-spec.ts
import { PublisherType } from '@app-types/models/course-series.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { CourseLevel } from '@app-types/models/course.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  executeGql,
  getAccountIdByLoginName,
  getCoachIdByAccountId,
  getManagerIdByAccountId,
  login,
} from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

describe('Course Sessions By Series (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let managerToken: string;
  let coachToken: string;
  let managerAccountId: number;
  let managerIdentityId: number;
  let coachIdentityId: number;

  const E2E_CATALOG_TITLE = 'E2E Session List Catalog';
  const E2E_SERIES_REMARK = 'E2E Session List Series';
  const E2E_SESSION_REMARK = 'E2E Session List Session';

  /**
   * 执行 GraphQL 查询
   * @param query 查询字符串
   * @param variables 变量对象
   * @param token JWT token
   * @returns supertest 请求对象
   */
  function postQuery(params: {
    readonly query: string;
    readonly variables?: unknown;
    readonly token?: string;
  }): request.Test {
    const req = request(app.getHttpServer())
      .post('/graphql')
      .send(
        params.variables
          ? { query: params.query, variables: params.variables }
          : { query: params.query },
      );
    if (params.token) req.set('Authorization', `Bearer ${params.token}`);
    return req;
  }

  /**
   * 清理本文件插入的测试数据
   */
  async function cleanupCourseFixtures(): Promise<void> {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM course_sessions WHERE remark = ?', [E2E_SESSION_REMARK]);
    await dataSource.query('DELETE FROM course_series WHERE remark = ?', [E2E_SERIES_REMARK]);
    await dataSource.query('DELETE FROM course_catalogs WHERE title = ?', [E2E_CATALOG_TITLE]);
  }

  /**
   * 创建一个用于挂载 series 的 catalog
   * @returns catalogId
   */
  async function ensureCatalog(): Promise<number> {
    const repo = dataSource.getRepository(CourseCatalogEntity);
    const existed = await repo.findOne({ where: { title: E2E_CATALOG_TITLE } });
    if (existed) return existed.id;
    const created = repo.create({
      courseLevel: CourseLevel.SANDA,
      title: E2E_CATALOG_TITLE,
      description: 'E2E session list test catalog',
      deactivatedAt: null,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
    });
    const saved = await repo.save(created);
    return saved.id;
  }

  /**
   * 创建一个用于列表查询的 series
   * @param catalogId 课程目录 ID
   * @returns seriesId
   */
  async function createSeries(params: { readonly catalogId: number }): Promise<number> {
    const repo = dataSource.getRepository(CourseSeriesEntity);
    const today = new Date().toISOString().slice(0, 10);
    const series = repo.create({
      catalogId: params.catalogId,
      publisherType: PublisherType.MANAGER,
      publisherId: managerIdentityId,
      title: 'E2E Session List Series',
      description: null,
      recurrenceRule: null,
      leaveCutoffHours: 12,
      pricePerSession: null,
      teachingFeeRef: null,
      maxLearners: 1,
      status: 'PUBLISHED',
      remark: E2E_SERIES_REMARK,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
      startDate: today,
      endDate: today,
    } as unknown as Partial<CourseSeriesEntity>);
    const saved = await repo.save(series);
    return saved.id;
  }

  /**
   * 创建一批 session，用于验证 recent window 与 all 两种模式
   * @param seriesId 开课班 ID
   * @param baseTime 基准时间
   * @returns 创建后的 session 列表（按插入顺序返回）
   */
  async function createSessions(params: {
    readonly seriesId: number;
    readonly baseTime: Date;
  }): Promise<CourseSessionEntity[]> {
    const repo = dataSource.getRepository(CourseSessionEntity);
    const mk = (start: Date, status: SessionStatus): Partial<CourseSessionEntity> => ({
      seriesId: params.seriesId,
      startTime: start,
      endTime: new Date(start.getTime() + 60 * 60 * 1000),
      leadCoachId: coachIdentityId,
      locationText: 'E2E Room',
      extraCoachesJson: null,
      status,
      remark: E2E_SESSION_REMARK,
      attendanceConfirmedAt: null,
      attendanceConfirmedBy: null,
      leaveCutoffHoursOverride: null,
      cutoffEvaluatedAt: null,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
    });

    const t = params.baseTime.getTime();
    const sessions: Partial<CourseSessionEntity>[] = [
      mk(new Date(t - 10 * 24 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t - 5 * 24 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t - 24 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t - 2 * 60 * 60 * 1000), SessionStatus.FINISHED),
      mk(new Date(t + 1 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t + 24 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t + 2 * 24 * 60 * 60 * 1000), SessionStatus.SCHEDULED),
      mk(new Date(t + 5 * 24 * 60 * 60 * 1000), SessionStatus.CANCELED),
    ];

    const saved: CourseSessionEntity[] = [];
    for (const s of sessions) {
      const entity = repo.create(s);
      saved.push(await repo.save(entity));
    }
    return saved;
  }

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    if (!dataSource.isInitialized) await dataSource.initialize();

    await cleanupCourseFixtures();
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({ dataSource, includeKeys: ['manager', 'coach'] });

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

    managerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.manager.loginName,
    );
    managerIdentityId = await getManagerIdByAccountId(dataSource, managerAccountId);
    const coachAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.coach.loginName,
    );
    coachIdentityId = await getCoachIdByAccountId(dataSource, coachAccountId);
  }, 30000);

  afterAll(async () => {
    try {
      await cleanupCourseFixtures();
      await cleanupTestAccounts(dataSource);
    } finally {
      if (app) await app.close();
    }
  });

  it('manager 能读取 RECENT_WINDOW 节次列表（默认 2 前 + 3 后）且按时间升序', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    const baseTime = new Date();
    await createSessions({ seriesId, baseTime });

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        courseSessionsBySeries(input: $input) {
          items { id startTime status }
        }
      }
    `;

    const res = await postQuery({
      query,
      variables: {
        input: {
          seriesId,
          mode: 'RECENT_WINDOW',
          baseTime: baseTime.toISOString(),
          pastLimit: 2,
          futureLimit: 3,
        },
      },
      token: managerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as { data?: { courseSessionsBySeries?: { items?: Array<{ startTime: string }> } } }
    ).data?.courseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items?.length).toBe(5);

    const times = (items ?? []).map((it) => new Date(it.startTime).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('ALL 模式返回全量列表（按时间升序），且支持 statusFilter', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    const baseTime = new Date();
    await createSessions({ seriesId, baseTime });

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        courseSessionsBySeries(input: $input) {
          items { id startTime status }
        }
      }
    `;

    const res = await postQuery({
      query,
      variables: {
        input: {
          seriesId,
          mode: 'ALL',
          maxSessions: 200,
          statusFilter: [SessionStatus.SCHEDULED],
        },
      },
      token: managerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: {
          courseSessionsBySeries?: { items?: Array<{ startTime: string; status: SessionStatus }> };
        };
      }
    ).data?.courseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items?.length).toBe(6);
    expect((items ?? []).every((it) => it.status === SessionStatus.SCHEDULED)).toBe(true);

    const times = (items ?? []).map((it) => new Date(it.startTime).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('coach 访问 courseSessionsBySeries 会被 RolesGuard 拒绝', async () => {
    const query = `
      query {
        courseSessionsBySeries(input: { seriesId: 1, mode: "RECENT_WINDOW" }) {
          items { id }
        }
      }
    `;
    const res = await executeGql({ app, query, token: coachToken }).expect(200);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].message).toContain('缺少所需角色');
    expect(res.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    expect(res.body.errors[0].extensions.details.requiredRoles).toEqual(['MANAGER', 'ADMIN']);
    expect(res.body.errors[0].extensions.details.userRoles).toEqual(['COACH']);
  });
});
