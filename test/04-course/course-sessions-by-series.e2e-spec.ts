/* eslint-disable complexity */
// test/04-course/course-sessions-by-series.e2e-spec.ts
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { CourseLevel } from '@app-types/models/course.types';
import { Gender } from '@app-types/models/user-info.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';
import { AppModule } from '@src/app.module';
import { CustomerEntity } from '@src/modules/account/identities/training/customer/account-customer.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionCoachEntity } from '@src/modules/course/session-coaches/course-session-coach.entity';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ParticipationEnrollmentEntity } from '@src/modules/participation/enrollment/participation-enrollment.entity';
import { ParticipationEnrollmentStatus } from '@src/types/models/participation-enrollment.types';
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
  let adminToken: string;
  let coachToken: string;
  let customerToken: string;
  let managerAccountId: number;
  let managerIdentityId: number;
  let coachIdentityId: number;
  let customerAccountId: number;
  let customerId: number;
  let coachCustomerToken: string;
  let coachCustomerIdentityId: number;

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
    await dataSource.query(
      'DELETE FROM course_session_coaches WHERE session_id IN (SELECT id FROM course_sessions WHERE remark = ?)',
      [E2E_SESSION_REMARK],
    );
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
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const endDateValue = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endDate = `${endDateValue.getFullYear()}-${String(endDateValue.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(endDateValue.getDate()).padStart(2, '0')}`;
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
      status: CourseSeriesStatus.PUBLISHED,
      remark: E2E_SERIES_REMARK,
      createdBy: managerAccountId,
      updatedBy: managerAccountId,
      startDate,
      endDate,
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

  /**
   * 为指定节次创建 session-coach 关联记录
   * @param params 关联参数
   */
  async function bindCoachToSessions(params: {
    readonly sessionIds: ReadonlyArray<number>;
    readonly coachId: number;
  }): Promise<void> {
    const repo = dataSource.getRepository(CourseSessionCoachEntity);
    for (const sessionId of params.sessionIds) {
      const entity = repo.create({
        sessionId,
        coachId: params.coachId,
        teachingFeeAmount: '0.00',
        bonusAmount: '0.00',
        payoutNote: null,
        payoutFinalizedAt: null,
        removedAt: null,
        removedBy: null,
        removedReason: null,
        createdBy: managerAccountId,
        updatedBy: managerAccountId,
      });
      await repo.save(entity);
    }
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
    await seedTestAccounts({
      dataSource,
      includeKeys: ['manager', 'admin', 'coach', 'customer', 'coachCustomer'],
    });

    managerToken = await login({
      app,
      loginName: testAccountsConfig.manager.loginName,
      loginPassword: testAccountsConfig.manager.loginPassword,
    });
    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
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
    coachCustomerToken = await login({
      app,
      loginName: testAccountsConfig.coachCustomer.loginName,
      loginPassword: testAccountsConfig.coachCustomer.loginPassword,
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
    customerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.customer.loginName,
    );
    const coachCustomerAccountId = await getAccountIdByLoginName(
      dataSource,
      testAccountsConfig.coachCustomer.loginName,
    );
    coachCustomerIdentityId = await getCoachIdByAccountId(dataSource, coachCustomerAccountId);
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const customer = await customerRepo.findOne({ where: { accountId: customerAccountId } });
    if (!customer) {
      throw new Error('E2E 预期的 customer 身份记录不存在');
    }
    customerId = customer.id;
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
    expect(res.body.errors[0].extensions.details.requiredRoles).toEqual(
      expect.arrayContaining(['ADMIN', 'MANAGER']),
    );
    expect(res.body.errors[0].extensions.details.requiredRoles).toHaveLength(2);
    expect(res.body.errors[0].extensions.details.userRoles).toEqual(['COACH']);
  });

  it('coach 可查询关联节次列表并返回 series 信息', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });
    const baseTime = new Date();
    const sessions = await createSessions({ seriesId, baseTime });
    await bindCoachToSessions({
      sessionIds: sessions.map((s) => s.id),
      coachId: coachIdentityId,
    });

    const query = `
      query ListCoachSessions($input: ListSessionsByCoachInput) {
        listCoachSessions(input: $input) {
          items {
            session { id seriesId startTime status }
            series { id title }
          }
        }
      }
    `;

    const res = await postQuery({
      query,
      variables: {
        input: {
          statusFilter: [SessionStatus.SCHEDULED],
        },
      },
      token: coachToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: {
          listCoachSessions?: {
            items?: Array<{
              session: { startTime: string; status: SessionStatus; seriesId: number };
              series: { id: number };
            }>;
          };
        };
      }
    ).data?.listCoachSessions?.items;

    const scheduled = sessions.filter((s) => s.status === SessionStatus.SCHEDULED);
    expect(items).toBeDefined();
    expect(items?.length).toBe(scheduled.length);

    const times = (items ?? []).map((it) => new Date(it.session.startTime).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    if (items && items.length > 0) {
      expect(Number(items[0]?.series?.id)).toBe(seriesId);
      expect(Number(items[0]?.session.seriesId)).toBe(seriesId);
    }
  });

  it('customer 调用 courseSessionsBySeries 会被 RolesGuard 拒绝', async () => {
    const query = `
      query {
        courseSessionsBySeries(input: { seriesId: 1, mode: "RECENT_WINDOW" }) {
          items { id }
        }
      }
    `;
    const res = await executeGql({ app, query, token: customerToken }).expect(200);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].message).toContain('缺少所需角色');
    expect(res.body.errors[0].extensions.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    expect(res.body.errors[0].extensions.details.requiredRoles).toEqual(
      expect.arrayContaining(['ADMIN', 'MANAGER']),
    );
    expect(res.body.errors[0].extensions.details.requiredRoles).toHaveLength(2);
    expect(res.body.errors[0].extensions.details.userRoles).toEqual(['CUSTOMER']);
  });

  it('customer 能通过 customerCourseSessionsBySeries 读取 PUBLISHED 且在时间窗内的 series 节次列表', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    const baseTime = new Date();
    await createSessions({ seriesId, baseTime });

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        customerCourseSessionsBySeries(input: $input) {
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
      token: customerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: { customerCourseSessionsBySeries?: { items?: Array<{ startTime: string }> } };
      }
    ).data?.customerCourseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items?.length).toBe(5);
  });

  it('customer 访问非可见的 series 时返回空列表', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    await dataSource.query('UPDATE course_series SET status = ? WHERE id = ?', [
      CourseSeriesStatus.SCHEDULED,
      seriesId,
    ]);
    await dataSource.query('DELETE FROM participation_enrollment WHERE customer_id = ?', [
      customerId,
    ]);

    const baseTime = new Date();
    await createSessions({ seriesId, baseTime });

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        customerCourseSessionsBySeries(input: $input) {
          items { id }
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
      token: customerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: { customerCourseSessionsBySeries?: { items?: Array<{ id: number }> } };
      }
    ).data?.customerCourseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items?.length).toBe(0);
  });

  it('customerCourseSessionsBySeries 不暴露内部字段（remark 等）', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    const baseTime = new Date();
    await createSessions({ seriesId, baseTime });

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        customerCourseSessionsBySeries(input: $input) {
          items { id seriesId startTime endTime leadCoachId locationText status }
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
      token: customerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: {
          customerCourseSessionsBySeries?: {
            items?: Array<Record<string, unknown>>;
          };
        };
      }
    ).data?.customerCourseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items && items.length).toBeGreaterThan(0);
    const keys = Object.keys(items?.[0] ?? {});
    expect(keys).toEqual(
      expect.arrayContaining([
        'id',
        'seriesId',
        'startTime',
        'endTime',
        'leadCoachId',
        'locationText',
        'status',
      ]),
    );
  });

  it('customer 在非可见 series 中存在有效报名时仍可看到节次列表', async () => {
    const catalogId = await ensureCatalog();
    const seriesId = await createSeries({ catalogId });

    await dataSource.query('UPDATE course_series SET status = ? WHERE id = ?', [
      CourseSeriesStatus.SCHEDULED,
      seriesId,
    ]);

    const baseTime = new Date();
    const sessions = await createSessions({ seriesId, baseTime });

    const learnerRepo = dataSource.getRepository(LearnerEntity);
    const learner = await learnerRepo.save(
      learnerRepo.create({
        accountId: null,
        customerId,
        name: 'E2E_enrolled_learner',
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        specialNeeds: null,
        countPerSession: 1,
        deactivatedAt: null,
        remark: 'E2E enrollment learner',
        createdBy: null,
        updatedBy: null,
      }),
    );

    const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
    await enrollmentRepo.save(
      enrollmentRepo.create({
        sessionId: sessions[0]?.id,
        learnerId: learner.id,
        customerId,
        status: ParticipationEnrollmentStatus.ENROLLED,
        statusChangedAt: null,
        statusChangedBy: null,
        statusReason: null,
        remark: 'E2E enrollment for invisible series',
        createdBy: customerAccountId,
        updatedBy: customerAccountId,
      }),
    );

    const query = `
      query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
        customerCourseSessionsBySeries(input: $input) {
          items { id }
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
      token: customerToken,
    }).expect(200);

    if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

    const items = (
      res.body as {
        data?: { customerCourseSessionsBySeries?: { items?: Array<{ id: number }> } };
      }
    ).data?.customerCourseSessionsBySeries?.items;
    expect(items).toBeDefined();
    expect(items && items.length).toBeGreaterThan(0);
  });

  describe('coach + customer 角色重叠场景', () => {
    it('在可见 series 上按 customer 路径访问成功', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });

      const baseTime = new Date();
      await createSessions({ seriesId, baseTime });

      const query = `
        query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
          customerCourseSessionsBySeries(input: $input) {
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
        token: coachCustomerToken,
      }).expect(200);

      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

      const items = (
        res.body as {
          data?: { customerCourseSessionsBySeries?: { items?: Array<{ startTime: string }> } };
        }
      ).data?.customerCourseSessionsBySeries?.items;
      expect(items).toBeDefined();
      expect(items?.length).toBe(5);
    });

    it('在非可见 series 且仅有 roster 绑定时按 coach 身份可访问', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });

      await dataSource.query('UPDATE course_series SET status = ? WHERE id = ?', [
        CourseSeriesStatus.SCHEDULED,
        seriesId,
      ]);

      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      await coachSessionRepo.save(
        coachSessionRepo.create({
          sessionId: sessions[0]?.id,
          coachId: coachCustomerIdentityId,
          teachingFeeAmount: '100.00',
          bonusAmount: '0.00',
          payoutNote: 'E2E coach roster binding',
          payoutFinalizedAt: null,
        }),
      );

      const query = `
        query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
          customerCourseSessionsBySeries(input: $input) {
            items { id }
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
        token: coachCustomerToken,
      }).expect(200);

      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

      const items = (
        res.body as {
          data?: { customerCourseSessionsBySeries?: { items?: Array<{ id: number }> } };
        }
      ).data?.customerCourseSessionsBySeries?.items;
      expect(items).toBeDefined();
      expect(items && items.length).toBeGreaterThan(0);
    });

    it('即便 roster 记录被标记 removed 仍按 coach 绑定放行', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });

      await dataSource.query('UPDATE course_series SET status = ? WHERE id = ?', [
        CourseSeriesStatus.SCHEDULED,
        seriesId,
      ]);

      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      await coachSessionRepo.save(
        coachSessionRepo.create({
          sessionId: sessions[0]?.id,
          coachId: coachCustomerIdentityId,
          teachingFeeAmount: '100.00',
          bonusAmount: '0.00',
          payoutNote: 'E2E coach roster removed',
          payoutFinalizedAt: null,
          removedAt: new Date(),
          removedBy: managerAccountId,
          removedReason: null,
        }),
      );

      const query = `
        query CourseSessionsBySeries($input: ListSessionsBySeriesInput!) {
          customerCourseSessionsBySeries(input: $input) {
            items { id }
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
        token: coachCustomerToken,
      }).expect(200);

      if (res.body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);

      const items = (
        res.body as {
          data?: { customerCourseSessionsBySeries?: { items?: Array<{ id: number }> } };
        }
      ).data?.customerCourseSessionsBySeries?.items;
      expect(items).toBeDefined();
      expect(items && items.length).toBeGreaterThan(0);
    });
  });

  describe('CourseSessionCoachesService roster 状态管理 (e2e)', () => {
    /**
     * 使用 ensureActive 在不存在记录时创建新的 active 结算记录
     * 并验证 existsCoachBoundToSeries 返回 true
     */
    it('ensureActive 在无记录时创建 active 并建立 series 绑定', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const beforeCount = await coachSessionRepo.count({
        where: { sessionId, coachId: coachIdentityId },
      });
      expect(beforeCount).toBe(0);

      const service = app.get<CourseSessionCoachesService>(CourseSessionCoachesService);
      const created = await service.ensureActive({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
      });

      expect(created.sessionId).toBe(sessionId);
      expect(created.coachId).toBe(coachIdentityId);
      expect(created.removedAt).toBeNull();
      expect(created.removedBy).toBeNull();
      expect(created.removedReason).toBeNull();
      expect(created.createdBy).toBe(managerAccountId);
      expect(created.updatedBy).toBe(managerAccountId);

      const bound = await service.existsCoachBoundToSeries({
        seriesId,
        coachId: coachIdentityId,
      });
      expect(bound).toBe(true);
    });

    /**
     * 使用 removeFromRoster 将 active 记录标记为 removed
     * 但不会取消 series 绑定（保留历史访问权限）
     */
    it('removeFromRoster 将 active 记录标记为 removed 但保留 series 绑定', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const service = app.get<CourseSessionCoachesService>(CourseSessionCoachesService);
      const active = await service.ensureActive({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
      });
      expect(active.removedAt).toBeNull();

      const removed = await service.removeFromRoster({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
        removedReason: SessionCoachRemovedReason.REPLACED,
      });

      expect(removed.removedAt).not.toBeNull();
      expect(removed.removedBy).toBe(managerAccountId);
      expect(removed.removedReason).toBe(SessionCoachRemovedReason.REPLACED);

      const bound = await service.existsCoachBoundToSeries({
        seriesId,
        coachId: coachIdentityId,
      });
      expect(bound).toBe(true);
    });

    /**
     * 先通过 removeFromRoster 标记 removed，再通过 ensureActive 复活
     * 验证 removed 字段被清空，series 绑定在整个过程中保持存在
     */
    it('ensureActive 可以复活已移出的记录但 series 绑定始终存在', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const service = app.get<CourseSessionCoachesService>(CourseSessionCoachesService);
      await service.ensureActive({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
      });

      await service.removeFromRoster({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
        removedReason: SessionCoachRemovedReason.OTHER,
      });

      const boundAfterRemove = await service.existsCoachBoundToSeries({
        seriesId,
        coachId: coachIdentityId,
      });
      expect(boundAfterRemove).toBe(true);

      const revived = await service.ensureActive({
        sessionId,
        coachId: coachIdentityId,
        operatorAccountId: managerAccountId,
      });

      expect(revived.removedAt).toBeNull();
      expect(revived.removedBy).toBeNull();
      expect(revived.removedReason).toBeNull();

      const boundAfterRevive = await service.existsCoachBoundToSeries({
        seriesId,
        coachId: coachIdentityId,
      });
      expect(boundAfterRevive).toBe(true);
    });

    it('使用 manager 在事务回滚时不会产生结算记录', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const beforeCount = await coachSessionRepo.count({
        where: { sessionId, coachId: coachIdentityId },
      });
      expect(beforeCount).toBe(0);

      const service = app.get<CourseSessionCoachesService>(CourseSessionCoachesService);

      await expect(
        dataSource.transaction(async (manager) => {
          await service.ensureActive({
            sessionId,
            coachId: coachIdentityId,
            operatorAccountId: managerAccountId,
            manager,
          });
          await service.update({
            sessionId,
            coachId: coachIdentityId,
            teachingFeeAmount: '88.00',
            bonusAmount: '8.00',
            payoutNote: 'E2E transactional rollback',
            manager,
          });
          await service.removeFromRoster({
            sessionId,
            coachId: coachIdentityId,
            operatorAccountId: managerAccountId,
            removedReason: SessionCoachRemovedReason.OTHER,
            manager,
          });

          throw new Error('E2E rollback');
        }),
      ).rejects.toThrow('E2E rollback');

      const afterCount = await coachSessionRepo.count({
        where: { sessionId, coachId: coachIdentityId },
      });
      expect(afterCount).toBe(0);
    });
  });

  describe('generateSessionCoachesForSeries & syncSessionCoachesRoster (GraphQL)', () => {
    it('manager 可以调用 generateSessionCoachesForSeries 为 SCHEDULED 节次创建教练关联', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });

      const mutation = `
        mutation Generate($input: GenerateSessionCoachesForSeriesInputGql!) {
          generateSessionCoachesForSeries(input: $input) {
            seriesId
            sessionsProcessed
            coachRelationsPlanned
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            seriesId,
            maxSessions: 200,
          },
        },
        token: managerToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const data = (
        res.body as {
          data?: {
            generateSessionCoachesForSeries?: {
              seriesId: number;
              sessionsProcessed: number;
              coachRelationsPlanned: number;
            };
          };
        }
      ).data?.generateSessionCoachesForSeries;

      expect(data).toBeDefined();
      expect(Number(data?.seriesId)).toBe(seriesId);

      const scheduledSessions = sessions.filter((s) => s.status === SessionStatus.SCHEDULED);
      expect(data?.sessionsProcessed).toBe(scheduledSessions.length);
      expect(data?.coachRelationsPlanned).toBe(scheduledSessions.length);

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      for (const s of scheduledSessions) {
        const count = await coachSessionRepo.count({
          where: { sessionId: s.id, coachId: coachIdentityId },
        });
        expect(count).toBe(1);
      }
    });

    it('admin 可以调用 generateSessionCoachesForSeries 为 SCHEDULED 节次创建教练关联', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });

      const mutation = `
        mutation Generate($input: GenerateSessionCoachesForSeriesInputGql!) {
          generateSessionCoachesForSeries(input: $input) {
            seriesId
            sessionsProcessed
            coachRelationsPlanned
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            seriesId,
            maxSessions: 200,
          },
        },
        token: adminToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const data = (
        res.body as {
          data?: {
            generateSessionCoachesForSeries?: {
              seriesId: number;
              sessionsProcessed: number;
              coachRelationsPlanned: number;
            };
          };
        }
      ).data?.generateSessionCoachesForSeries;

      expect(data).toBeDefined();
      expect(Number(data?.seriesId)).toBe(seriesId);

      const scheduledSessions = sessions.filter((s) => s.status === SessionStatus.SCHEDULED);
      expect(data?.sessionsProcessed).toBe(scheduledSessions.length);
      expect(data?.coachRelationsPlanned).toBe(scheduledSessions.length);
    });

    it('coach 调用 generateSessionCoachesForSeries 会被 RolesGuard 拒绝', async () => {
      const mutation = `
        mutation Generate($input: GenerateSessionCoachesForSeriesInputGql!) {
          generateSessionCoachesForSeries(input: $input) {
            seriesId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            seriesId: 1,
            maxSessions: 10,
          },
        },
        token: coachToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('缺少所需角色');
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.extensions?.details?.requiredRoles).toEqual(
        expect.arrayContaining(['MANAGER', 'ADMIN']),
      );
      expect(err.extensions?.details?.userRoles).toEqual(['COACH']);
    });

    it('匿名调用 generateSessionCoachesForSeries 会被 JwtAuthGuard 拒绝', async () => {
      const mutation = `
        mutation Generate($input: GenerateSessionCoachesForSeriesInputGql!) {
          generateSessionCoachesForSeries(input: $input) {
            seriesId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            seriesId: 1,
            maxSessions: 10,
          },
        },
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('JWT');
      expect(err.extensions?.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
    });

    it('manager 可以调用 syncSessionCoachesRoster 将 roster 覆盖为指定教练集合', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const mutation = `
        mutation SyncRoster($input: SyncSessionCoachesRosterInputGql!) {
          syncSessionCoachesRoster(input: $input) {
            sessionId
            activatedCount
            removedCount
          }
        }
      `;

      const res1 = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId,
            coachIds: [coachIdentityId, coachCustomerIdentityId],
          },
        },
        token: managerToken,
      }).expect(200);

      if (res1.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res1.body.errors)}`);
      }

      const data1 = (
        res1.body as {
          data?: {
            syncSessionCoachesRoster?: {
              sessionId: number;
              activatedCount: number;
              removedCount: number;
            };
          };
        }
      ).data?.syncSessionCoachesRoster;

      expect(data1).toBeDefined();
      expect(Number(data1?.sessionId)).toBe(sessionId);
      expect(data1?.activatedCount).toBe(2);
      expect(data1?.removedCount).toBe(0);

      const res2 = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId,
            coachIds: [coachIdentityId],
          },
        },
        token: managerToken,
      }).expect(200);

      if (res2.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res2.body.errors)}`);
      }

      const data2 = (
        res2.body as {
          data?: {
            syncSessionCoachesRoster?: {
              sessionId: number;
              activatedCount: number;
              removedCount: number;
            };
          };
        }
      ).data?.syncSessionCoachesRoster;

      expect(data2).toBeDefined();
      expect(Number(data2?.sessionId)).toBe(sessionId);
      expect(data2?.activatedCount).toBe(0);
      expect(data2?.removedCount).toBe(1);

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const activeCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachIdentityId },
      });
      const removedCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachCustomerIdentityId },
      });

      expect(activeCoach).toBeDefined();
      expect(activeCoach?.removedAt).toBeNull();
      expect(removedCoach).toBeDefined();
      expect(removedCoach?.removedAt).not.toBeNull();
      expect(removedCoach?.removedReason).toBe(SessionCoachRemovedReason.REPLACED);
    });

    it('admin 可以调用 syncSessionCoachesRoster 将 roster 覆盖为指定教练集合', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      const mutation = `
        mutation SyncRoster($input: SyncSessionCoachesRosterInputGql!) {
          syncSessionCoachesRoster(input: $input) {
            sessionId
            activatedCount
            removedCount
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId,
            coachIds: [coachIdentityId],
          },
        },
        token: adminToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const data = (
        res.body as {
          data?: {
            syncSessionCoachesRoster?: {
              sessionId: number;
              activatedCount: number;
              removedCount: number;
            };
          };
        }
      ).data?.syncSessionCoachesRoster;

      expect(data).toBeDefined();
      expect(Number(data?.sessionId)).toBe(sessionId);
      expect(data?.activatedCount).toBe(1);
      expect(data?.removedCount).toBe(0);
    });

    it('manager 传入空 coachIds 调用 syncSessionCoachesRoster 会被 Usecase 拒绝', async () => {
      const mutation = `
        mutation SyncRoster($input: SyncSessionCoachesRosterInputGql!) {
          syncSessionCoachesRoster(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [],
          },
        },
        token: managerToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('目标教练列表不能为空');
      expect(err.extensions?.errorCode).toBe('SESSION_STATUS_INVALID');
    });

    it('匿名调用 syncSessionCoachesRoster 会被 JwtAuthGuard 拒绝', async () => {
      const mutation = `
        mutation SyncRoster($input: SyncSessionCoachesRosterInputGql!) {
          syncSessionCoachesRoster(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [coachIdentityId],
          },
        },
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('JWT');
      expect(err.extensions?.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
    });

    it('coach 调用 syncSessionCoachesRoster 会被 RolesGuard 拒绝', async () => {
      const mutation = `
        mutation SyncRoster($input: SyncSessionCoachesRosterInputGql!) {
          syncSessionCoachesRoster(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [coachIdentityId],
          },
        },
        token: coachToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('缺少所需角色');
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.extensions?.details?.requiredRoles).toEqual(
        expect.arrayContaining(['MANAGER', 'ADMIN']),
      );
      expect(err.extensions?.details?.userRoles).toEqual(['COACH']);
    });
  });

  describe('listSessionCoachesBySeries (GraphQL)', () => {
    it('manager 可以按 series 查询节次教练列表', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      await bindCoachToSessions({ sessionIds: [sessionId], coachId: coachIdentityId });
      await bindCoachToSessions({ sessionIds: [sessionId], coachId: coachCustomerIdentityId });

      const query = `
        query List($input: ListSessionsBySeriesInput!) {
          listSessionCoachesBySeries(input: $input) {
            items {
              sessionId
              startTime
              endTime
              leadCoach { id name level }
              assistantCoaches { id name level }
            }
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
          },
        },
        token: managerToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const items = (
        res.body as {
          data?: {
            listSessionCoachesBySeries?: {
              items?: Array<{
                sessionId: number;
                leadCoach?: { id: number };
                assistantCoaches?: Array<{ id: number }>;
              }>;
            };
          };
        }
      ).data?.listSessionCoachesBySeries?.items;

      expect(items).toBeDefined();
      const target = (items ?? []).find((item) => Number(item.sessionId) === sessionId);
      expect(target).toBeDefined();
      expect(Number(target?.leadCoach?.id)).toBe(coachIdentityId);
      expect((target?.assistantCoaches ?? []).map((coach) => Number(coach.id))).toContain(
        coachCustomerIdentityId,
      );
    });

    it('coach 调用 listSessionCoachesBySeries 会被 RolesGuard 拒绝', async () => {
      const query = `
        query List($input: ListSessionsBySeriesInput!) {
          listSessionCoachesBySeries(input: $input) {
            items {
              sessionId
            }
          }
        }
      `;

      const res = await postQuery({
        query,
        variables: {
          input: {
            seriesId: 1,
            mode: 'ALL',
            maxSessions: 10,
          },
        },
        token: coachToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('缺少所需角色');
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.extensions?.details?.requiredRoles).toEqual(
        expect.arrayContaining(['MANAGER', 'ADMIN']),
      );
      expect(err.extensions?.details?.userRoles).toEqual(['COACH']);
    });
  });

  describe('removeSessionCoaches (GraphQL)', () => {
    it('manager 可以移除副教练且保留主教练', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      await bindCoachToSessions({ sessionIds: [sessionId], coachId: coachIdentityId });
      await bindCoachToSessions({ sessionIds: [sessionId], coachId: coachCustomerIdentityId });

      const mutation = `
        mutation Remove($input: RemoveSessionCoachesInputGql!) {
          removeSessionCoaches(input: $input) {
            sessionId
            removedCount
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId,
            coachIds: [coachCustomerIdentityId],
          },
        },
        token: managerToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const data = (
        res.body as {
          data?: {
            removeSessionCoaches?: {
              sessionId: number;
              removedCount: number;
            };
          };
        }
      ).data?.removeSessionCoaches;

      expect(data).toBeDefined();
      expect(Number(data?.sessionId)).toBe(sessionId);
      expect(data?.removedCount).toBe(1);

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const leadCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachIdentityId },
      });
      const removedCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachCustomerIdentityId },
      });

      expect(leadCoach).toBeDefined();
      expect(leadCoach?.removedAt).toBeNull();
      expect(removedCoach).toBeDefined();
      expect(removedCoach?.removedAt).not.toBeNull();
    });

    it('manager 移除主教练会被 Usecase 拒绝', async () => {
      const mutation = `
        mutation Remove($input: RemoveSessionCoachesInputGql!) {
          removeSessionCoaches(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [coachIdentityId],
          },
        },
        token: managerToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('不能移除主教练');
      expect(err.extensions?.errorCode).toBe('SESSION_STATUS_INVALID');
    });
  });

  describe('appendSessionCoaches (GraphQL)', () => {
    it('manager 可以追加教练且不移除已有 roster', async () => {
      const catalogId = await ensureCatalog();
      const seriesId = await createSeries({ catalogId });
      const baseTime = new Date();
      const sessions = await createSessions({ seriesId, baseTime });
      const sessionId = sessions[0]?.id;
      if (!sessionId) throw new Error('测试前置失败：未生成节次');

      await bindCoachToSessions({ sessionIds: [sessionId], coachId: coachIdentityId });

      const mutation = `
        mutation AppendRoster($input: AppendSessionCoachesInputGql!) {
          appendSessionCoaches(input: $input) {
            sessionId
            activatedCount
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId,
            coachIds: [coachCustomerIdentityId],
          },
        },
        token: managerToken,
      }).expect(200);

      if (res.body.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(res.body.errors)}`);
      }

      const data = (
        res.body as {
          data?: {
            appendSessionCoaches?: {
              sessionId: number;
              activatedCount: number;
            };
          };
        }
      ).data?.appendSessionCoaches;

      expect(data).toBeDefined();
      expect(Number(data?.sessionId)).toBe(sessionId);
      expect(data?.activatedCount).toBe(1);

      const coachSessionRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const leadCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachIdentityId },
      });
      const appendedCoach = await coachSessionRepo.findOne({
        where: { sessionId, coachId: coachCustomerIdentityId },
      });

      expect(leadCoach).toBeDefined();
      expect(leadCoach?.removedAt).toBeNull();
      expect(appendedCoach).toBeDefined();
      expect(appendedCoach?.removedAt).toBeNull();
    });

    it('manager 传入空 coachIds 调用 appendSessionCoaches 会被 Usecase 拒绝', async () => {
      const mutation = `
        mutation AppendRoster($input: AppendSessionCoachesInputGql!) {
          appendSessionCoaches(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [],
          },
        },
        token: managerToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('目标教练列表不能为空');
      expect(err.extensions?.errorCode).toBe('SESSION_STATUS_INVALID');
    });

    it('匿名调用 appendSessionCoaches 会被 JwtAuthGuard 拒绝', async () => {
      const mutation = `
        mutation AppendRoster($input: AppendSessionCoachesInputGql!) {
          appendSessionCoaches(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [coachIdentityId],
          },
        },
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('JWT');
      expect(err.extensions?.errorCode).toBe('JWT_AUTHENTICATION_FAILED');
    });

    it('coach 调用 appendSessionCoaches 会被 RolesGuard 拒绝', async () => {
      const mutation = `
        mutation AppendRoster($input: AppendSessionCoachesInputGql!) {
          appendSessionCoaches(input: $input) {
            sessionId
          }
        }
      `;

      const res = await postQuery({
        query: mutation,
        variables: {
          input: {
            sessionId: 1,
            coachIds: [coachIdentityId],
          },
        },
        token: coachToken,
      }).expect(200);

      expect(res.body.errors).toBeDefined();
      const err = res.body.errors[0];
      expect(String(err.message ?? '')).toContain('缺少所需角色');
      expect(err.extensions?.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.extensions?.details?.requiredRoles).toEqual(
        expect.arrayContaining(['MANAGER', 'ADMIN']),
      );
      expect(err.extensions?.details?.userRoles).toEqual(['COACH']);
    });
  });
});
