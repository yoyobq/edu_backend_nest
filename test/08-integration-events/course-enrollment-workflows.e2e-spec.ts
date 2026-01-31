// 文件位置：/var/www/backend/test/08-integration-events/course-enrollment-workflows.e2e-spec.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import { CourseLevel } from '@app-types/models/course.types';
import type { IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import type { IOutboxStorePort } from '@core/common/integration-events/outbox.port';
import { INTEGRATION_EVENTS_TOKENS } from '@modules/common/integration-events/events.tokens';
import {
  OutboxDispatcher,
  type IntegrationEventHandler,
} from '@modules/common/integration-events/outbox.dispatcher';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ParticipationEnrollmentEntity } from '@src/modules/participation/enrollment/participation-enrollment.entity';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { Gender } from '@src/types/models/user-info.types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { executeGql as executeGqlUtils, login as loginUtils } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 测试处理器：记录 EnrollmentCreated 的调用次数与顺序
 */
class TestRecordHandler implements IntegrationEventHandler {
  readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
  private readonly keys: string[] = [];
  private count = 0;

  /**
   * 处理集成事件（记录 dedupKey 与调用次数）
   * @param input 只读事件信封参数对象
   */
  async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
    await Promise.resolve();
    if (input.envelope.dedupKey) {
      this.keys.push(input.envelope.dedupKey);
    }
    this.count += 1;
  }

  /**
   * 重置处理器内部状态
   */
  reset(): void {
    this.keys.length = 0;
    this.count = 0;
  }

  /**
   * 获取累计调用次数
   */
  get calls(): number {
    return this.count;
  }

  /**
   * 获取按顺序记录的 dedupKey 列表
   */
  get order(): ReadonlyArray<string> {
    return this.keys;
  }
}

/**
 * GraphQL 登录，返回 access token
 * 使用 AuthLoginInput 进行密码登录
 */
async function login(opts: {
  readonly app: INestApplication;
  readonly loginName: string;
  readonly loginPassword: string;
}): Promise<string> {
  return await loginUtils({
    app: opts.app,
    loginName: opts.loginName,
    loginPassword: opts.loginPassword,
  });
}

/**
 * 确保存在一个测试课程目录并返回其 ID
 * 使用直接写库以便独立于上层 Resolver 测试
 */
async function ensureTestCatalog(ds: DataSource): Promise<number> {
  const repo = ds.getRepository(CourseCatalogEntity);
  const level: CourseLevel = CourseLevel.FITNESS;
  const existed = await repo.findOne({ where: { courseLevel: level } });
  if (existed) {
    await repo.update(existed.id, {
      title: '体能课程（报名工作流测试）',
      description: 'E2E 报名工作流测试目录',
      deactivatedAt: null,
    });
    return existed.id;
  }
  const created = await repo.save(
    repo.create({
      courseLevel: level,
      title: '体能课程（报名工作流测试）',
      description: 'E2E 报名工作流测试目录',
      deactivatedAt: null,
      createdBy: null,
      updatedBy: null,
    } as CourseCatalogEntity),
  );
  return Number(created.id);
}

/**
 * 创建一个测试开课班并返回其 ID
 * 关联 Manager 发布者与测试目录
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
      title: `E2E 报名开课班 ${Date.now()}`,
      description: '报名工作流自动化测试开课班',
      venueType: VenueType.SANDA_GYM,
      classMode: ClassMode.SMALL_CLASS,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      recurrenceRule: null,
      leaveCutoffHours: 12,
      pricePerSession: '100.00',
      teachingFeeRef: '80.00',
      maxLearners: 8,
      status: CourseSeriesStatus.SCHEDULED,
      remark: 'E2E 报名工作流用开课班',
      createdBy: null,
      updatedBy: null,
    }),
  );
  return Number(created.id);
}

/**
 * 创建一个测试课程节次并返回其 ID
 * 关联系列、主教练与地点
 */
const createTestSessionSeq = { value: 0 };

async function createTestSession(
  ds: DataSource,
  params: {
    readonly seriesId: number;
    readonly leadCoachId: number;
    readonly startOffsetMinutes?: number;
  },
): Promise<number> {
  const repo = ds.getRepository(CourseSessionEntity);
  const base = Date.now() + 48 * 3600 * 1000;
  const uniqueSecondOffset = (createTestSessionSeq.value++ % 3600) * 1000;
  const start = new Date(base + (params.startOffsetMinutes ?? 0) * 60 * 1000 + uniqueSecondOffset);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await repo.save(
    repo.create({
      seriesId: params.seriesId,
      startTime: start,
      endTime: end,
      leadCoachId: params.leadCoachId,
      locationText: '散打馆 A1 教室',
      extraCoachesJson: null,
      remark: 'E2E 报名工作流用节次',
      createdBy: null,
      updatedBy: null,
    }),
  );
  return created.id;
}

/**
 * 获取指定登录名对应的 Account ID
 */
async function getAccountIdByLoginName(ds: DataSource, loginName: string): Promise<number> {
  const acc = await ds.getRepository(AccountEntity).findOne({ where: { loginName } });
  if (!acc) throw new Error(`账号不存在: ${loginName}`);
  return acc.id;
}

/**
 * 获取教练/经理/学员的身份表主键 ID
 */
async function getCoachIdByAccountId(ds: DataSource, accountId: number): Promise<number> {
  const coach = await ds.getRepository(CoachEntity).findOne({ where: { accountId } });
  if (!coach) throw new Error(`未找到教练身份: accountId=${accountId}`);
  return coach.id;
}
async function getManagerIdByAccountId(ds: DataSource, accountId: number): Promise<number> {
  const manager = await ds.getRepository(ManagerEntity).findOne({ where: { accountId } });
  if (!manager) throw new Error(`未找到经理身份: accountId=${accountId}`);
  return manager.id;
}
async function getLearnerIdByAccountId(ds: DataSource, accountId: number): Promise<number> {
  const learner = await ds.getRepository(LearnerEntity).findOne({ where: { accountId } });
  if (!learner) throw new Error(`未找到学员身份: accountId=${accountId}`);
  return learner.id;
}

/**
 * 创建额外 Learner 记录（同一 Customer），用于容量与权限测试
 * @param params 创建参数对象（数据源、客户 ID、名称后缀）
 */
async function createExtraLearnerForCustomer(params: {
  readonly ds: DataSource;
  readonly customerId: number;
  readonly nameSuffix: string;
}): Promise<number> {
  const repo = params.ds.getRepository(LearnerEntity);
  const created = await repo.save(
    repo.create({
      accountId: null,
      customerId: params.customerId,
      name: `E2E_${params.nameSuffix}_${Date.now()}`,
      gender: Gender.SECRET,
      birthDate: null,
      avatarUrl: null,
      specialNeeds: 'E2E 报名测试',
      countPerSession: 1,
      deactivatedAt: null,
      remark: `E2E 报名测试学员 - ${params.nameSuffix}`,
      createdBy: null,
      updatedBy: null,
    }),
  );
  return created.id;
}

/**
 * 以指定 token 执行 GraphQL 查询或变更
 * 返回 supertest 请求对象，便于断言状态码
 */
function executeGql(
  app: INestApplication,
  params: { readonly query: string; readonly token?: string },
): request.Test {
  return executeGqlUtils({ app, query: params.query, token: params.token });
}

/**
 * 简易异步等待
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('08-Integration-Events 课程报名工作流 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let store: IOutboxStorePort;
  const handler = new TestRecordHandler();

  let customerToken: string;
  let managerToken: string;
  let adminToken: string;
  let seriesId: number;
  let sessionId: number;
  let learnerId: number;
  let customerId: number;

  beforeAll(async () => {
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([handler])
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
      .useFactory({
        factory: (
          config: ConfigService,
          storePort: IOutboxStorePort,
          handlers: ReadonlyArray<IntegrationEventHandler>,
        ) => {
          const proxyConfig: ConfigService = {
            get<T = unknown>(key: string, defaultValue?: T): T {
              const patch: Record<string, unknown> = {
                INTEV_BACKOFF_SERIES: [50, 50],
                INTEV_DISPATCH_INTERVAL_MS: 50,
              };
              const v = (patch[key] ?? undefined) as T | undefined;
              if (v !== undefined) return v;
              const origin = config.get<T>(key);
              return (origin ?? defaultValue) as T;
            },
          } as unknown as ConfigService;
          return new OutboxDispatcher(proxyConfig, storePort, handlers);
        },
        inject: [
          ConfigService,
          INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT,
          INTEGRATION_EVENTS_TOKENS.HANDLERS,
        ],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    store = app.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);

    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: null,
      includeKeys: ['manager', 'coach', 'customer', 'learner', 'admin'],
    });

    customerToken = await login({
      app,
      loginName: testAccountsConfig.customer.loginName,
      loginPassword: testAccountsConfig.customer.loginPassword,
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
    customerId = customer.id;

    handler.reset();
  }, 30000);

  afterAll(async () => {
    try {
      await dataSource.getRepository(CourseSessionEntity).delete({ seriesId });
      await dataSource.getRepository(CourseSeriesEntity).delete({ id: seriesId });
      await cleanupTestAccounts(dataSource);
    } finally {
      if (app) await app.close();
    }
  });

  describe('EnrollLearnerToSessionUsecase', () => {
    beforeAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });

    it('新报名触发 EnrollmentCreated 并被 Outbox 消费', async () => {
      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 首次报名" }) {
            isNewlyCreated
            enrollment {
              id
              sessionId
              learnerId
              customerId
              status
              statusReason
              remark
            }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data: {
          enrollLearnerToSession: {
            isNewlyCreated: boolean;
            enrollment: {
              id: number;
              sessionId: number;
              learnerId: number;
              customerId: number;
              status: string;
              statusReason: string | null;
              remark: string | null;
            };
          };
        };
      };

      expect(body.data.enrollLearnerToSession.isNewlyCreated).toBe(true);
      expect(body.data.enrollLearnerToSession.enrollment.sessionId).toBe(sessionId);
      expect(body.data.enrollLearnerToSession.enrollment.learnerId).toBe(learnerId);
      await sleep(350);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      expect(handler.calls).toBeGreaterThanOrEqual(1);
    });

    it('重复报名幂等：不触发 EnrollmentCreated 事件', async () => {
      const baselineCalls = handler.calls;
      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 重复报名" }) {
            isNewlyCreated
            enrollment { id sessionId learnerId customerId status statusReason remark }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data: { enrollLearnerToSession: { isNewlyCreated: boolean } };
      };
      expect(body.data.enrollLearnerToSession.isNewlyCreated).toBe(false);

      await sleep(250);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      expect(handler.calls).toBe(baselineCalls);
    });

    it('查询学员在开课班的已报名节次 ID 列表', async () => {
      const ensureMutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 查询前置" }) {
            isNewlyCreated
          }
        }
      `;
      await executeGql(app, { query: ensureMutation, token: customerToken }).expect(200);

      const query = `
        query {
          listLearnerEnrolledSessionIdsBySeries(input: { seriesId: ${seriesId}, learnerId: ${learnerId} }) {
            sessionIds
          }
        }
      `;
      const res = await executeGql(app, { query, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: { listLearnerEnrolledSessionIdsBySeries?: { sessionIds: number[] } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const ids = body.data?.listLearnerEnrolledSessionIdsBySeries?.sessionIds ?? [];
      expect(ids).toContain(sessionId);
    });

    it('查询节次报名列表', async () => {
      const ensureMutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 节次报名查询前置" }) {
            isNewlyCreated
          }
        }
      `;
      await executeGql(app, { query: ensureMutation, token: customerToken }).expect(200);

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
      const res = await executeGql(app, { query, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          listSessionEnrollments?: Array<{ id: number; sessionId: number; learnerId: number }>;
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const items = body.data?.listSessionEnrollments ?? [];
      expect(items.length).toBeGreaterThan(0);
      const target = items.find(
        (item) => item.sessionId === sessionId && item.learnerId === learnerId,
      );
      expect(target).toBeTruthy();
    });

    it('半路报名仅为目标节次创建报名', async () => {
      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const baseSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!baseSession) throw new Error('测试前置失败：未找到基准节次');
      const leadCoachId = baseSession.leadCoachId;

      const pastSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId,
        startOffsetMinutes: -(48 * 60 + 120),
      });
      const targetSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId,
        startOffsetMinutes: 120,
      });
      const futureSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId,
        startOffsetMinutes: 240,
      });
      await enrollmentRepo.delete({
        sessionId: In([pastSessionId, targetSessionId, futureSessionId]),
        learnerId,
      });

      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${targetSessionId}, learnerId: ${learnerId}, remark: "E2E 插班报名" }) {
            isNewlyCreated
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.enrollLearnerToSession?.isNewlyCreated).toBe(true);

      const pastEnrollment = await enrollmentRepo.findOne({
        where: { sessionId: pastSessionId, learnerId },
      });
      const targetEnrollment = await enrollmentRepo.findOne({
        where: { sessionId: targetSessionId, learnerId },
      });
      const futureEnrollment = await enrollmentRepo.findOne({
        where: { sessionId: futureSessionId, learnerId },
      });
      expect(pastEnrollment).toBeNull();
      expect(targetEnrollment).toBeTruthy();
      expect(futureEnrollment).toBeNull();

      await enrollmentRepo.delete({
        sessionId: In([pastSessionId, targetSessionId, futureSessionId]),
        learnerId,
      });
    });
  });

  describe('EnrollLearnerToSeriesUsecase - 容量校验与角色跳过 (e2e)', () => {
    let capacitySeriesId: number;
    let capacitySessionId: number;
    let fillerLearnerId: number;
    let managerTargetLearnerId: number;
    let adminTargetLearnerId: number;

    beforeAll(async () => {
      const catalogId = await ensureTestCatalog(dataSource);
      const managerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.manager.loginName,
      );
      const managerId = await getManagerIdByAccountId(dataSource, managerAccountId);
      capacitySeriesId = await createTestSeries(dataSource, catalogId, managerId);
      await dataSource
        .getRepository(CourseSeriesEntity)
        .update({ id: capacitySeriesId }, { maxLearners: 1 });

      const coachAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.coach.loginName,
      );
      const coachId = await getCoachIdByAccountId(dataSource, coachAccountId);
      capacitySessionId = await createTestSession(dataSource, {
        seriesId: capacitySeriesId,
        leadCoachId: coachId,
        startOffsetMinutes: 24 * 60,
      });

      fillerLearnerId = await createExtraLearnerForCustomer({
        ds: dataSource,
        customerId,
        nameSuffix: 'capacity_filler',
      });
      managerTargetLearnerId = await createExtraLearnerForCustomer({
        ds: dataSource,
        customerId,
        nameSuffix: 'capacity_manager',
      });
      adminTargetLearnerId = await createExtraLearnerForCustomer({
        ds: dataSource,
        customerId,
        nameSuffix: 'capacity_admin',
      });

      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      await enrollmentService.create({
        sessionId: capacitySessionId,
        learnerId: fillerLearnerId,
        customerId,
        remark: 'E2E 容量占位',
        createdBy: null,
      });
    });

    it('customer 报名容量已满节次：返回 ENROLLMENT_CAPACITY_EXCEEDED', async () => {
      const mutation = `
        mutation {
          enrollLearnerToSeries(input: { seriesId: ${capacitySeriesId}, learnerId: ${managerTargetLearnerId}, remark: "E2E 容量校验 - customer" }) {
            createdEnrollmentIds
            restoredEnrollmentIds
            unchangedEnrollmentIds
            failed { sessionId code message }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          enrollLearnerToSeries?: {
            createdEnrollmentIds: number[];
            restoredEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
            failed: Array<{ sessionId: number; code: string; message: string }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const result = body.data?.enrollLearnerToSeries;
      expect(result).toBeDefined();
      expect(result?.createdEnrollmentIds.length).toBe(0);
      expect(result?.failed.length).toBeGreaterThanOrEqual(1);
      expect(result?.failed[0]?.code).toBe('ENROLLMENT_CAPACITY_EXCEEDED');
    });

    it('manager 报名容量已满节次：跳过容量校验并创建', async () => {
      const mutation = `
        mutation {
          enrollLearnerToSeries(input: { seriesId: ${capacitySeriesId}, learnerId: ${managerTargetLearnerId}, remark: "E2E 容量校验 - manager" }) {
            createdEnrollmentIds
            restoredEnrollmentIds
            unchangedEnrollmentIds
            failed { sessionId code message }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          enrollLearnerToSeries?: {
            createdEnrollmentIds: number[];
            restoredEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
            failed: Array<{ sessionId: number; code: string; message: string }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const result = body.data?.enrollLearnerToSeries;
      expect(result).toBeDefined();
      expect(result?.failed.length).toBe(0);
      expect(result?.createdEnrollmentIds.length).toBe(1);
    });

    it('admin 报名容量已满节次：跳过容量校验并创建', async () => {
      const mutation = `
        mutation {
          enrollLearnerToSeries(input: { seriesId: ${capacitySeriesId}, learnerId: ${adminTargetLearnerId}, remark: "E2E 容量校验 - admin" }) {
            createdEnrollmentIds
            restoredEnrollmentIds
            unchangedEnrollmentIds
            failed { sessionId code message }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: adminToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          enrollLearnerToSeries?: {
            createdEnrollmentIds: number[];
            restoredEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
            failed: Array<{ sessionId: number; code: string; message: string }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const result = body.data?.enrollLearnerToSeries;
      expect(result).toBeDefined();
      expect(result?.failed.length).toBe(0);
      expect(result?.createdEnrollmentIds.length).toBe(1);
    });

    afterAll(async () => {
      await dataSource
        .getRepository(ParticipationEnrollmentEntity)
        .delete({ sessionId: capacitySessionId });
      await dataSource.getRepository(CourseSessionEntity).delete({ id: capacitySessionId });
      await dataSource.getRepository(CourseSeriesEntity).delete({ id: capacitySeriesId });
      await dataSource.getRepository(LearnerEntity).delete({
        id: In([fillerLearnerId, managerTargetLearnerId, adminTargetLearnerId]),
      });
    });
  });

  describe('HasLearnerEnrollmentUsecase (GraphQL)', () => {
    let extraLearnerId: number;

    beforeAll(async () => {
      extraLearnerId = await createExtraLearnerForCustomer({
        ds: dataSource,
        customerId,
        nameSuffix: 'has_enrollment',
      });
      await dataSource
        .getRepository(ParticipationEnrollmentEntity)
        .delete({ learnerId: extraLearnerId });
    });

    afterAll(async () => {
      await dataSource.getRepository(ParticipationEnrollmentEntity).delete({
        learnerId: extraLearnerId,
      });
      await dataSource.getRepository(LearnerEntity).delete({ id: extraLearnerId });
    });

    it('学员无报名时返回 false', async () => {
      const query = `
        query {
          hasLearnerEnrollment(input: { learnerId: ${extraLearnerId} }) {
            hasEnrollment
          }
        }
      `;
      const res = await executeGql(app, { query, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: { hasLearnerEnrollment?: { hasEnrollment: boolean } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.hasLearnerEnrollment?.hasEnrollment).toBe(false);
    });

    it('学员报名后返回 true', async () => {
      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${extraLearnerId}, remark: "E2E hasLearnerEnrollment" }) {
            isNewlyCreated
          }
        }
      `;
      await executeGql(app, { query: mutation, token: customerToken }).expect(200);

      const query = `
        query {
          hasLearnerEnrollment(input: { learnerId: ${extraLearnerId} }) {
            hasEnrollment
          }
        }
      `;
      const res = await executeGql(app, { query, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: { hasLearnerEnrollment?: { hasEnrollment: boolean } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.hasLearnerEnrollment?.hasEnrollment).toBe(true);
    });
  });
});
