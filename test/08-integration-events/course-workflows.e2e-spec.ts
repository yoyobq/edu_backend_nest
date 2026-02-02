// 文件位置：/var/www/backend/test/08-integration-events/course-workflows.e2e-spec.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { CourseLevel } from '@app-types/models/course.types';
import { type IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
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
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionCoachEntity } from '@src/modules/course/session-coaches/course-session-coach.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ParticipationAttendanceRecordEntity } from '@src/modules/participation/attendance/participation-attendance-record.entity';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentEntity } from '@src/modules/participation/enrollment/participation-enrollment.entity';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { AccountStatus, IdentityTypeEnum } from '@src/types/models/account.types';
import { ParticipationAttendanceStatus } from '@src/types/models/attendance.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';
import { Gender, UserState } from '@src/types/models/user-info.types';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
import { executeGql as executeGqlUtils, login as loginUtils } from '../utils/e2e-graphql-utils';
import { cleanupTestAccounts, seedTestAccounts, testAccountsConfig } from '../utils/test-accounts';

/**
 * 测试处理器：记录调用次数与顺序
 * 只处理 EnrollmentCreated，不抛错，便于稳定断言
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
 * 测试处理器：记录 SessionClosed 的调用次数与顺序
 */
class TestSessionClosedHandler implements IntegrationEventHandler {
  readonly type: IntegrationEventEnvelope['type'] = 'SessionClosed';
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

  /** 重置处理器内部状态 */
  reset(): void {
    this.keys.length = 0;
    this.count = 0;
  }

  /** 获取累计调用次数 */
  get calls(): number {
    return this.count;
  }

  /** 获取按顺序记录的 dedupKey 列表 */
  get order(): ReadonlyArray<string> {
    return this.keys;
  }
}

/**
 * 测试处理器：记录 EnrollmentCancelled 的调用次数与顺序
 */
class TestEnrollmentCancelledHandler implements IntegrationEventHandler {
  readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCancelled';
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

  /** 重置处理器内部状态 */
  reset(): void {
    this.keys.length = 0;
    this.count = 0;
  }

  /** 获取累计调用次数 */
  get calls(): number {
    return this.count;
  }

  /** 获取按顺序记录的 dedupKey 列表 */
  get order(): ReadonlyArray<string> {
    return this.keys;
  }
}

/**
 * 局部应用构建：覆盖处理器集合与部分配置键值
 * 返回 app 与 outbox 端口，便于测试控制与断言
 */
// 该文件原有 withPatchedApp 辅助函数未被使用，已移除以满足 ESLint 规范

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
  const level = CourseLevel.FITNESS;
  const existed = await repo.findOne({ where: { courseLevel: level } });
  if (existed) {
    await repo.update(existed.id, {
      title: '体能课程（工作流测试）',
      description: 'E2E 工作流测试目录',
      deactivatedAt: null,
    });
    return existed.id;
  }
  const created = await repo.save(
    repo.create({
      courseLevel: level,
      title: '体能课程（工作流测试）',
      description: 'E2E 工作流测试目录',
      deactivatedAt: null,
      createdBy: null,
      updatedBy: null,
    }),
  );
  return created.id;
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
      title: `E2E 开课班 ${Date.now()}`,
      description: '课程工作流自动化测试开课班',
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
      remark: 'E2E 工作流用开课班',
      createdBy: null,
      updatedBy: null,
    }),
  );
  return created.id;
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
      remark: 'E2E 工作流用节次',
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
 * 以指定 token 执行 GraphQL 查询或变更
 * 返回 supertest 请求对象，便于断言状态码
 */
function executeGql(
  app: INestApplication,
  params: { readonly query: string; readonly token?: string },
): request.Test {
  return executeGqlUtils({ app, query: params.query, token: params.token });
}

type AttendanceDetailItemPayload = {
  enrollmentId: number;
  learnerId: number;
  learnerName: string;
  gender: Gender;
  age: number | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  attendanceStatus: string;
  countApplied: string;
  enrollmentStatus: ParticipationEnrollmentStatus;
  enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  customerRemainingSessions: number;
};

type AttendanceDetailPayload = {
  sessionId: number;
  items: AttendanceDetailItemPayload[];
};

type AttendanceDetailExpectations = {
  enrollmentId: number;
  customerId: number;
  learnerName: string;
  gender: Gender;
  birthDate: string | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  customerName: string;
  customerPhone: string | null;
  customerRemainingSessions: number;
  enrollmentStatus: ParticipationEnrollmentStatus;
  enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
  countApplied: string;
  attendanceStatus: ParticipationAttendanceStatus;
  age: number | null;
};

async function ensureEnrollmentForAttendanceDetail(params: {
  readonly app: INestApplication;
  readonly dataSource: DataSource;
  readonly sessionId: number;
  readonly learnerId: number;
  readonly customerToken: string;
}): Promise<ParticipationEnrollmentEntity> {
  const attendanceRepo = params.dataSource.getRepository(ParticipationAttendanceRecordEntity);
  const enrollmentRepo = params.dataSource.getRepository(ParticipationEnrollmentEntity);

  await attendanceRepo.delete({ sessionId: params.sessionId, learnerId: params.learnerId });
  await enrollmentRepo.delete({ sessionId: params.sessionId, learnerId: params.learnerId });

  const mutation = `
    mutation {
      enrollLearnerToSession(input: { sessionId: ${params.sessionId}, learnerId: ${params.learnerId}, remark: "E2E 出勤明细报名" }) {
        isNewlyCreated
      }
    }
  `;
  const res = await executeGql(params.app, {
    query: mutation,
    token: params.customerToken,
  }).expect(200);
  const body = res.body as unknown as {
    data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
    errors?: unknown;
  };
  if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);

  const enrollment = await enrollmentRepo.findOne({
    where: { sessionId: params.sessionId, learnerId: params.learnerId },
  });
  if (!enrollment) throw new Error('前置失败：未找到报名记录');
  return enrollment;
}

async function loadExpectedLearnerForAttendanceDetail(params: {
  readonly dataSource: DataSource;
  readonly learnerId: number;
}): Promise<{
  name: string;
  gender: Gender;
  birthDate: string | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  countPerSession: number;
}> {
  const learner = await params.dataSource
    .getRepository(LearnerEntity)
    .findOne({ where: { id: params.learnerId } });
  if (!learner) throw new Error('前置失败：未找到学员信息');
  return {
    name: learner.name,
    gender: learner.gender,
    birthDate: learner.birthDate ?? null,
    avatarUrl: learner.avatarUrl ?? null,
    specialNeeds: learner.specialNeeds ?? null,
    countPerSession: Number(learner.countPerSession),
  };
}

async function loadExpectedCustomerForAttendanceDetail(params: {
  readonly app: INestApplication;
  readonly dataSource: DataSource;
  readonly customerLoginName: string;
}): Promise<{
  id: number;
  name: string;
  phone: string | null;
  remainingSessions: number;
}> {
  const customerAccountId = await getAccountIdByLoginName(
    params.dataSource,
    params.customerLoginName,
  );
  const customerService = params.app.get<CustomerService>(CustomerService);
  const customer = await customerService.findByAccountId(customerAccountId);
  if (!customer) throw new Error('前置失败：未找到 Customer 身份');
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.contactPhone ?? null,
    remainingSessions: Number(customer.remainingSessions),
  };
}

function computeExpectedAgeForAttendanceDetail(params: {
  readonly birthDate: string | null;
}): number | null {
  if (!params.birthDate) return null;
  const parts = params.birthDate.split('-').map((value) => Number(value));
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return null;
  const [year, month, day] = parts;
  const today = new Date();
  let age = today.getFullYear() - year;
  const hasBirthdayPassed =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasBirthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

function computeExpectedCountApplied(params: { readonly countPerSession: number }): string {
  const count = params.countPerSession;
  const safe = Number.isFinite(count) ? count : 0;
  return safe.toFixed(2);
}

async function querySessionAttendanceDetail(params: {
  readonly app: INestApplication;
  readonly sessionId: number;
  readonly token: string;
}): Promise<AttendanceDetailPayload> {
  const query = `
    query {
      loadSessionAttendanceDetail(sessionId: ${params.sessionId}) {
        sessionId
        items {
          enrollmentId
          learnerId
          learnerName
          gender
          age
          avatarUrl
          specialNeeds
          attendanceStatus
          countApplied
          enrollmentStatus
          enrollmentStatusReason
          customerId
          customerName
          customerPhone
          customerRemainingSessions
        }
      }
    }
  `;
  const res = await executeGql(params.app, { query, token: params.token }).expect(200);
  const body = res.body as unknown as {
    data?: { loadSessionAttendanceDetail?: AttendanceDetailPayload };
    errors?: unknown;
  };
  if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
  const payload = body.data?.loadSessionAttendanceDetail;
  if (!payload) throw new Error('GraphQL 返回为空');
  return payload;
}

/**
 * 简易异步等待
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('08-Integration-Events 课程工作流：报名触发与 Outbox 分发 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let store: IOutboxStorePort;
  const handler = new TestRecordHandler();
  const closeHandler = new TestSessionClosedHandler();
  const cancelHandler = new TestEnrollmentCancelledHandler();

  let customerToken: string;
  let managerToken: string;
  let coachToken: string;
  let adminToken: string;
  let guestToken: string;
  let emptyRolesToken: string;
  let seriesId: number;
  let sessionId: number;
  let learnerId: number;

  beforeAll(async () => {
    // 初始化 GraphQL Schema（注册枚举/类型）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([handler, closeHandler, cancelHandler])
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
    // Outbox Dispatcher 由模块生命周期自动启动，测试无需直接持有引用

    // 清理并造数：创建 manager / coach / customer / learner
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: null,
      includeKeys: ['manager', 'coach', 'customer', 'learner', 'admin', 'guest', 'emptyRoles'],
    });

    // 登录客户账号，作为自助报名发起者
    customerToken = await login({
      app,
      loginName: testAccountsConfig.customer.loginName,
      loginPassword: testAccountsConfig.customer.loginPassword,
    });

    // 登录经理账号，作为结课授权操作者
    managerToken = await login({
      app,
      loginName: testAccountsConfig.manager.loginName,
      loginPassword: testAccountsConfig.manager.loginPassword,
    });

    // 登录教练账号，作为点名视图读取者（需与节次 leadCoach 身份一致）
    coachToken = await login({
      app,
      loginName: testAccountsConfig.coach.loginName,
      loginPassword: testAccountsConfig.coach.loginPassword,
    });

    adminToken = await login({
      app,
      loginName: testAccountsConfig.admin.loginName,
      loginPassword: testAccountsConfig.admin.loginPassword,
    });

    guestToken = await login({
      app,
      loginName: testAccountsConfig.guest.loginName,
      loginPassword: testAccountsConfig.guest.loginPassword,
    });

    emptyRolesToken = await login({
      app,
      loginName: testAccountsConfig.emptyRoles.loginName,
      loginPassword: testAccountsConfig.emptyRoles.loginPassword,
    });

    // 准备课程数据：目录 → 系列 → 节次
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

    handler.reset();
    closeHandler.reset();
    cancelHandler.reset();
  }, 30000);

  afterAll(async () => {
    try {
      // 清理课程数据：先删节次，再删系列（避免外键约束），目录保留
      await dataSource.getRepository(CourseSessionEntity).delete({ seriesId });
      await dataSource.getRepository(CourseSeriesEntity).delete({ id: seriesId });
      // 清理测试账号
      await cleanupTestAccounts(dataSource);
    } finally {
      if (app) await app.close();
    }
  });

  /**
   * LoadSessionAttendanceSheetUsecase 首次与再次读取 (e2e)
   * 验证：
   * - 首次读取：当不存在出勤记录时，内存合成返回默认 NO_SHOW 与学员计次比例
   * - 再次读取：当存在出勤记录时，返回持久化记录的状态与计次
   */
  describe('LoadSessionAttendanceSheet GraphQL - 首次与再次读取 (e2e)', () => {
    // 通过 DI 获取出勤服务；报名服务注入仅为潜在扩展，这里不使用以避免未用变量

    // 为潜在扩展保留的注入变量（当前未使用）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let enrollmentServiceForSetup: ParticipationEnrollmentService | null;
    let attendanceService: ParticipationAttendanceService;

    /**
     * 构建 leadCoach 会话
     */
    const buildLeadCoachSession = async (): Promise<{ accountId: number; roles: string[] }> => {
      const coachAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.coach.loginName,
      );
      return { accountId: coachAccountId, roles: ['COACH'] };
    };

    beforeAll(async () => {
      enrollmentServiceForSetup = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      attendanceService = app.get<ParticipationAttendanceService>(ParticipationAttendanceService);

      // 预置报名：使用客户身份为指定学员报名到测试节次
      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 预置报名" }) {
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
    });

    it('首次读取：无出勤记录时返回默认 NO_SHOW 与学员计次', async () => {
      // 构造权限会话（教练），仅用于触发权限校验，不直接使用变量
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      buildLeadCoachSession();

      // 准备：确保存在报名记录且无出勤记录
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!enrollment) throw new Error('前置失败：未找到报名记录');
      const existed = await attendanceService.findByEnrollmentId(enrollment.id);
      if (existed) {
        // 清理以模拟首次读取（不落库）
        await dataSource
          .createQueryBuilder()
          .delete()
          .from(ParticipationAttendanceRecordEntity)
          .where('enrollment_id = :eid', { eid: enrollment.id })
          .execute();
      }

      const query = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId isFinalized rows { enrollmentId learnerId status countApplied confirmedByCoachId confirmedAt finalized enrollmentStatus enrollmentStatusReason } } }
      `;
      const res = await executeGql(app, { query, token: coachToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          loadSessionAttendanceSheet: {
            sessionId: number;
            isFinalized: boolean;
            rows: Array<{
              enrollmentId: number;
              learnerId: number;
              status: string;
              countApplied: string;
              confirmedByCoachId: number | null;
              confirmedAt: string | null;
              finalized: boolean;
              enrollmentStatus: ParticipationEnrollmentStatus;
              enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
            }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const sheet = body.data!.loadSessionAttendanceSheet;
      const row = sheet.rows.find((r) => r.enrollmentId === enrollment.id);
      expect(row).toBeTruthy();
      expect(row?.status).toBe(ParticipationAttendanceStatus.NO_SHOW);
      // 计次来源于 learner.countPerSession（种子为 1）
      expect(row?.countApplied).toBe('1.00');
      expect(row?.enrollmentStatus).toBe(ParticipationEnrollmentStatus.ENROLLED);
      expect(row?.enrollmentStatusReason).toBeNull();
    });

    it('再次读取：存在出勤记录时返回持久化状态与计次', async () => {
      // 构造权限会话（教练），仅用于触发权限校验，不直接使用变量
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      buildLeadCoachSession();

      // 准备：为报名写入出勤记录（PRESENT, 1.00）
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!enrollment) throw new Error('前置失败：未找到报名记录');
      await attendanceService.upsertByEnrollment({
        enrollmentId: enrollment.id,
        sessionId,
        learnerId,
        status: ParticipationAttendanceStatus.PRESENT,
        countApplied: '1.00',
        confirmedByCoachId: null,
        confirmedAt: new Date(),
      });

      const query = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId isFinalized rows { enrollmentId learnerId status countApplied confirmedByCoachId confirmedAt finalized enrollmentStatus enrollmentStatusReason } } }
      `;
      const res = await executeGql(app, { query, token: coachToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          loadSessionAttendanceSheet: {
            sessionId: number;
            isFinalized: boolean;
            rows: Array<{
              enrollmentId: number;
              learnerId: number;
              status: string;
              countApplied: string;
              confirmedByCoachId: number | null;
              confirmedAt: string | null;
              finalized: boolean;
              enrollmentStatus: ParticipationEnrollmentStatus;
              enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
            }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const sheet = body.data!.loadSessionAttendanceSheet;
      const row = sheet.rows.find((r) => r.enrollmentId === enrollment.id);
      expect(row).toBeTruthy();
      expect(row?.status).toBe(ParticipationAttendanceStatus.PRESENT);
      expect(row?.countApplied).toBe('1.00');
      expect(row?.enrollmentStatus).toBe(ParticipationEnrollmentStatus.ENROLLED);
      expect(row?.enrollmentStatusReason).toBeNull();
    });

    it('首次读取与再次读取的数据结构完全一致', async () => {
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!enrollment) throw new Error('前置失败：未找到报名记录');

      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('enrollment_id = :eid', { eid: enrollment.id })
        .execute();

      const q1 = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId isFinalized rows { enrollmentId learnerId status countApplied confirmedByCoachId confirmedAt finalized enrollmentStatus enrollmentStatusReason } } }
      `;
      const r1 = await executeGql(app, { query: q1, token: coachToken }).expect(200);
      const b1 = r1.body as unknown as {
        data?: {
          loadSessionAttendanceSheet: {
            sessionId: number;
            isFinalized: boolean;
            rows: Array<{
              enrollmentId: number;
              learnerId: number;
              status: string;
              countApplied: string;
              confirmedByCoachId: number | null;
              confirmedAt: string | null;
              finalized: boolean;
              enrollmentStatus: ParticipationEnrollmentStatus;
              enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
            }>;
          };
        };
        errors?: unknown;
      };
      if (b1.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(b1.errors)}`);
      const s1 = b1.data!.loadSessionAttendanceSheet;
      const row1 = s1.rows.find((r) => r.enrollmentId === enrollment.id)!;

      await attendanceService.upsertByEnrollment({
        enrollmentId: enrollment.id,
        sessionId,
        learnerId,
        status: ParticipationAttendanceStatus.PRESENT,
        countApplied: '1.00',
        confirmedByCoachId: null,
        confirmedAt: new Date(),
      });

      const q2 = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId isFinalized rows { enrollmentId learnerId status countApplied confirmedByCoachId confirmedAt finalized enrollmentStatus enrollmentStatusReason } } }
      `;
      const r2 = await executeGql(app, { query: q2, token: coachToken }).expect(200);
      const b2 = r2.body as unknown as {
        data?: {
          loadSessionAttendanceSheet: {
            sessionId: number;
            isFinalized: boolean;
            rows: Array<{
              enrollmentId: number;
              learnerId: number;
              status: string;
              countApplied: string;
              confirmedByCoachId: number | null;
              confirmedAt: string | null;
              finalized: boolean;
              enrollmentStatus: ParticipationEnrollmentStatus;
              enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
            }>;
          };
        };
        errors?: unknown;
      };
      if (b2.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(b2.errors)}`);
      const s2 = b2.data!.loadSessionAttendanceSheet;
      const row2 = s2.rows.find((r) => r.enrollmentId === enrollment.id)!;

      const sheetKeysEqual = Object.keys(s1).sort().join(',') === Object.keys(s2).sort().join(',');
      expect(sheetKeysEqual).toBe(true);
      const rowKeysEqual =
        Object.keys(row1).sort().join(',') === Object.keys(row2).sort().join(',');
      expect(rowKeysEqual).toBe(true);
    });

    afterAll(async () => {
      // 清理：移除当前 session/learner 的出勤与报名，避免影响后续“新报名”用例
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  describe('LoadSessionAttendanceDetail GraphQL - 正例 (e2e)', () => {
    let expected: AttendanceDetailExpectations;

    beforeAll(async () => {
      const enrollment = await ensureEnrollmentForAttendanceDetail({
        app,
        dataSource,
        sessionId,
        learnerId,
        customerToken,
      });
      const learner = await loadExpectedLearnerForAttendanceDetail({ dataSource, learnerId });
      const customer = await loadExpectedCustomerForAttendanceDetail({
        app,
        dataSource,
        customerLoginName: testAccountsConfig.customer.loginName,
      });

      expected = {
        enrollmentId: enrollment.id,
        customerId: enrollment.customerId,
        learnerName: learner.name,
        gender: learner.gender,
        birthDate: learner.birthDate,
        avatarUrl: learner.avatarUrl,
        specialNeeds: learner.specialNeeds,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerRemainingSessions: customer.remainingSessions,
        enrollmentStatus: enrollment.status,
        enrollmentStatusReason: enrollment.statusReason ?? null,
        countApplied: computeExpectedCountApplied({ countPerSession: learner.countPerSession }),
        attendanceStatus: ParticipationAttendanceStatus.NO_SHOW,
        age: computeExpectedAgeForAttendanceDetail({ birthDate: learner.birthDate }),
      };
    });

    it('应返回学员与客户的完整出勤明细字段', async () => {
      const payload = await querySessionAttendanceDetail({
        app,
        sessionId,
        token: coachToken,
      });
      expect(payload.sessionId).toBe(sessionId);
      const item = payload.items.find((row) => row.enrollmentId === expected.enrollmentId);
      if (!item) throw new Error('未找到对应报名的出勤明细');
      expect(item.learnerId).toBe(learnerId);
      expect(item.learnerName).toBe(expected.learnerName);
      expect(item.gender).toBe(expected.gender);
      expect(item.age).toBe(expected.age);
      expect(item.avatarUrl).toBe(expected.avatarUrl);
      expect(item.specialNeeds).toBe(expected.specialNeeds);
      expect(item.attendanceStatus).toBe(String(expected.attendanceStatus));
      expect(item.countApplied).toBe(expected.countApplied);
      expect(item.enrollmentStatus).toBe(expected.enrollmentStatus);
      expect(item.enrollmentStatusReason ?? null).toBe(expected.enrollmentStatusReason);
      expect(item.customerId).toBe(expected.customerId);
      expect(item.customerName).toBe(expected.customerName);
      expect(item.customerPhone).toBe(expected.customerPhone);
      expect(item.customerRemainingSessions).toBe(expected.customerRemainingSessions);
    });

    afterAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  /**
   * RequestSessionLeave GraphQL - 正例 (e2e)
   * 验证：学员请假写入 EXCUSED 出勤并返回完整字段
   */
  describe('RequestSessionLeave GraphQL - 正例 (e2e)', () => {
    let enrollmentId: number;

    /**
     * 初始化请假前置数据
     */
    beforeAll(async () => {
      const attendanceRepo = dataSource.getRepository(ParticipationAttendanceRecordEntity);
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);

      await attendanceRepo.delete({ sessionId, learnerId });
      await enrollmentRepo.delete({ sessionId, learnerId });

      const mutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 请假前置报名" }) {
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

      const latest = await enrollmentRepo.findOne({ where: { sessionId, learnerId } });
      if (!latest) throw new Error('前置失败：未找到报名记录');
      enrollmentId = latest.id;

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      await sessionRepo.update({ id: sessionId }, { leaveCutoffHoursOverride: 0 });
    });

    /**
     * 校验返回字段与报名状态
     */
    it('学员请假应更新报名状态为 LEAVE', async () => {
      const mutation = `
        mutation RequestLeave($input: RequestSessionLeaveInputGql!) {
          requestSessionLeave(input: $input) {
            isUpdated
            enrollment {
              id
              sessionId
              learnerId
              customerId
              status
              statusReason
            }
          }
        }
      `;
      const variables = {
        input: {
          sessionId,
          learnerId,
          reason: ParticipationEnrollmentStatusReason.LEAVE_OTHER,
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: {
          requestSessionLeave?: {
            isUpdated: boolean;
            enrollment: {
              id: number;
              sessionId: number;
              learnerId: number;
              customerId: number;
              status: string;
              statusReason: string | null;
            };
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const result = body.data?.requestSessionLeave;
      expect(result?.isUpdated).toBe(true);
      expect(result?.enrollment.id).toBe(enrollmentId);
      expect(result?.enrollment.sessionId).toBe(sessionId);
      expect(result?.enrollment.learnerId).toBe(learnerId);
      expect(result?.enrollment.status).toBe(ParticipationEnrollmentStatus.LEAVE);
      expect(result?.enrollment.statusReason).toBe(ParticipationEnrollmentStatusReason.LEAVE_OTHER);

      const attendanceRepo = dataSource.getRepository(ParticipationAttendanceRecordEntity);
      const row = await attendanceRepo.findOne({ where: { enrollmentId, sessionId, learnerId } });
      expect(row).toBeNull();
    });

    /**
     * 清理测试数据
     */
    afterAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  /**
   * ListSessionLeaveRequests GraphQL - 正例 (e2e)
   * 验证：返回已请假的明细行（含请假原因与学员）
   */
  describe('ListSessionLeaveRequests GraphQL - 正例 (e2e)', () => {
    let attendanceService: ParticipationAttendanceService;
    let enrollmentId: number;
    let learnerName: string;

    /**
     * 初始化请假前置数据
     */
    beforeAll(async () => {
      attendanceService = app.get<ParticipationAttendanceService>(ParticipationAttendanceService);

      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const existed = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!existed) {
        const mutation = `
          mutation {
            enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 请假查询前置报名" }) {
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
      }
      const latest = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!latest) throw new Error('前置失败：未找到报名记录');
      enrollmentId = latest.id;

      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learner = await learnerRepo.findOne({ where: { id: learnerId } });
      if (!learner) throw new Error('前置失败：未找到学员');
      learnerName = learner.name;

      await attendanceService.upsertByEnrollment({
        enrollmentId,
        sessionId,
        learnerId,
        status: ParticipationAttendanceStatus.EXCUSED,
        countApplied: '0.00',
        confirmedByCoachId: null,
        confirmedAt: new Date(),
        remark: ParticipationEnrollmentStatusReason.LEAVE_OTHER,
      });
    });

    /**
     * 校验返回字段完整性与数据正确性
     */
    it('查询已请假列表应返回原因与学员信息', async () => {
      const query = `
        query {
          listSessionLeaveRequests(sessionId: ${sessionId}) {
            sessionId
            items {
              enrollmentId
              learnerId
              learnerName
              reason
              confirmedAt
            }
          }
        }
      `;
      const res = await executeGql(app, { query, token: coachToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          listSessionLeaveRequests?: {
            sessionId: number;
            items: Array<{
              enrollmentId: number;
              learnerId: number;
              learnerName: string;
              reason: string | null;
              confirmedAt: string | null;
            }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const list = body.data?.listSessionLeaveRequests;
      const item = list?.items.find((r) => r.enrollmentId === enrollmentId);
      expect(item).toBeTruthy();
      expect(item?.learnerId).toBe(learnerId);
      expect(item?.learnerName).toBe(learnerName);
      expect(item?.reason).toBe(ParticipationEnrollmentStatusReason.LEAVE_OTHER);
      expect(item?.confirmedAt).toBeTruthy();
    });

    /**
     * 清理测试数据
     */
    afterAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  describe('ListFinalizedAttendance GraphQL - 正例 (e2e)', () => {
    let finalizedSessionId: number;
    let finalizedEnrollmentId: number;
    let learnerName: string;
    let seriesTitle: string;
    let catalogTitle: string;

    beforeAll(async () => {
      const seriesRepo = dataSource.getRepository(CourseSeriesEntity);
      const catalogRepo = dataSource.getRepository(CourseCatalogEntity);
      const series = await seriesRepo.findOne({ where: { id: seriesId } });
      if (!series) throw new Error('前置失败：未找到开课班');
      seriesTitle = series.title;
      const catalog = await catalogRepo.findOne({ where: { id: series.catalogId } });
      if (!catalog) throw new Error('前置失败：未找到课程目录');
      catalogTitle = catalog.title;

      const coachAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.coach.loginName,
      );
      const coachId = await getCoachIdByAccountId(dataSource, coachAccountId);
      finalizedSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: coachId,
        startOffsetMinutes: 10,
      });

      const enrollMutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${finalizedSessionId}, learnerId: ${learnerId}, remark: "E2E 已终审报名" }) {
            isNewlyCreated
          }
        }
      `;
      const enrollRes = await executeGql(app, {
        query: enrollMutation,
        token: customerToken,
      }).expect(200);
      const enrollBody = enrollRes.body as unknown as {
        data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
        errors?: unknown;
      };
      if (enrollBody.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(enrollBody.errors)}`);

      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrRepo.findOne({
        where: { sessionId: finalizedSessionId, learnerId },
      });
      if (!enrollment) throw new Error('前置失败：未找到报名记录');
      finalizedEnrollmentId = enrollment.id;

      const learnerRepo = dataSource.getRepository(LearnerEntity);
      const learner = await learnerRepo.findOne({ where: { id: learnerId } });
      if (!learner) throw new Error('前置失败：未找到学员');
      learnerName = learner.name;

      const recordMutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const recordVariables = {
        input: {
          sessionId: finalizedSessionId,
          items: [
            {
              enrollmentId: finalizedEnrollmentId,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '1.0',
              remark: 'finalized-attendance',
            },
          ],
        },
      };
      const recordRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: recordMutation, variables: recordVariables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const recordBody = recordRes.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (recordBody.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(recordBody.errors)}`);
      expect(recordBody.data!.recordSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      const finalizeMutation = `
        mutation Finalize($input: FinalizeSessionAttendanceInputGql!) {
          finalizeSessionAttendance(input: $input) { updatedCount }
        }
      `;
      const finalizeVariables = { input: { sessionId: finalizedSessionId } };
      const finalizeRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: finalizeMutation, variables: finalizeVariables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const finalizeBody = finalizeRes.body as unknown as {
        data?: { finalizeSessionAttendance?: { updatedCount: number } };
        errors?: unknown;
      };
      if (finalizeBody.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(finalizeBody.errors)}`);
      }
      expect(finalizeBody.data!.finalizeSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);
    });

    it('查询已终审出勤关联的开课班列表', async () => {
      const query = `
        query {
          listFinalizedAttendanceSeries {
            catalogId
            catalogTitle
            title
            startDate
            endDate
            leadCoachName
            status
          }
        }
      `;
      const res = await executeGql(app, { query, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          listFinalizedAttendanceSeries?: Array<{
            catalogId: number;
            catalogTitle: string;
            title: string;
            startDate: string;
            endDate: string;
            leadCoachName: string | null;
            status: CourseSeriesStatus;
          }>;
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const items = body.data?.listFinalizedAttendanceSeries ?? [];
      const hit = items.find(
        (item) => item.title === seriesTitle && item.catalogTitle === catalogTitle,
      );
      expect(hit).toBeTruthy();
      expect(hit?.status).toBe(CourseSeriesStatus.SCHEDULED);
    });

    it('按开课班查询已终审出勤记录列表', async () => {
      const query = `
        query {
          listFinalizedAttendanceBySeries(input: { seriesId: ${seriesId} }) {
            attendanceId
            sessionId
            enrollmentId
            learnerId
            learnerName
            status
            countApplied
            confirmedByCoachId
            confirmedByCoachName
            confirmedAt
            remark
          }
        }
      `;
      const res = await executeGql(app, { query, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          listFinalizedAttendanceBySeries?: Array<{
            attendanceId: number;
            sessionId: number;
            enrollmentId: number;
            learnerId: number;
            learnerName: string;
            status: string;
            countApplied: string;
            confirmedByCoachId: number | null;
            confirmedByCoachName: string | null;
            confirmedAt: string | null;
            remark: string | null;
          }>;
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const items = body.data?.listFinalizedAttendanceBySeries ?? [];
      const hit = items.find(
        (item) =>
          item.sessionId === finalizedSessionId && item.enrollmentId === finalizedEnrollmentId,
      );
      expect(hit).toBeTruthy();
      expect(hit?.learnerId).toBe(learnerId);
      expect(hit?.learnerName).toBe(learnerName);
      expect(hit?.status).toBe(ParticipationAttendanceStatus.PRESENT);
      expect(hit?.countApplied).toMatch(/^1(\.0+)?$/);
      expect(hit?.remark).toBe('finalized-attendance');
    });

    afterAll(async () => {
      await dataSource.getRepository(ParticipationAttendanceRecordEntity).delete({
        sessionId: finalizedSessionId,
        learnerId,
      });
      await dataSource.getRepository(ParticipationEnrollmentEntity).delete({
        sessionId: finalizedSessionId,
        learnerId,
      });
      await dataSource.getRepository(CourseSessionEntity).delete({ id: finalizedSessionId });
    });
  });

  describe('ListAttendanceSessionsByCoach GraphQL - 正例 (e2e)', () => {
    let targetSessionId: number;
    let enrollmentId: number;
    let coachId: number;
    let sessionStart: Date;
    let sessionEnd: Date;
    let seriesTitle: string;
    let sessionStatus: SessionStatus;

    /**
     * 准备出勤节次、报名与出勤记录
     */
    beforeAll(async () => {
      const coachAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.coach.loginName,
      );
      coachId = await getCoachIdByAccountId(dataSource, coachAccountId);
      targetSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: coachId,
        startOffsetMinutes: 20,
      });

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const session = await sessionRepo.findOne({ where: { id: targetSessionId } });
      if (!session) throw new Error('前置失败：未找到节次');
      sessionStart = session.startTime;
      sessionEnd = session.endTime;
      sessionStatus = session.status;

      const seriesRepo = dataSource.getRepository(CourseSeriesEntity);
      const series = await seriesRepo.findOne({ where: { id: seriesId } });
      if (!series) throw new Error('前置失败：未找到开课班');
      seriesTitle = series.title;

      const coachRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const existingCoach = await coachRepo.findOne({
        where: { sessionId: targetSessionId, coachId },
      });
      if (!existingCoach) {
        await coachRepo.save(
          coachRepo.create({
            sessionId: targetSessionId,
            coachId,
            teachingFeeAmount: '0.00',
            bonusAmount: '0.00',
            payoutNote: null,
            payoutFinalizedAt: null,
            createdBy: null,
            updatedBy: null,
          }),
        );
      }

      const enrollMutation = `
        mutation {
          enrollLearnerToSession(input: { sessionId: ${targetSessionId}, learnerId: ${learnerId}, remark: "E2E 出勤时间段报名" }) {
            isNewlyCreated
          }
        }
      `;
      const enrollRes = await executeGql(app, {
        query: enrollMutation,
        token: customerToken,
      }).expect(200);
      const enrollBody = enrollRes.body as unknown as {
        data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
        errors?: unknown;
      };
      if (enrollBody.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(enrollBody.errors)}`);

      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrRepo.findOne({
        where: { sessionId: targetSessionId, learnerId },
      });
      if (!enrollment) throw new Error('前置失败：未找到报名记录');
      enrollmentId = enrollment.id;

      const attendanceService = app.get(ParticipationAttendanceService);
      await attendanceService.upsertByEnrollment({
        enrollmentId,
        sessionId: targetSessionId,
        learnerId,
        status: ParticipationAttendanceStatus.PRESENT,
        countApplied: '1.00',
        confirmedByCoachId: null,
        confirmedAt: new Date(),
        remark: 'E2E 列表出勤记录',
      });
    });

    /**
     * 查询并校验返回的节次与 series 信息
     */
    it('按时间段与 coach 查询关联节次', async () => {
      const query = `
        query ListAttendanceSessionsByCoach($input: ListAttendanceSessionsByCoachInputGql!) {
          listAttendanceSessionsByCoach(input: $input) {
            sessionId
            seriesId
            seriesTitle
            startTime
            endTime
            locationText
            status
          }
        }
      `;
      const variables = {
        input: {
          coachId,
          rangeStart: new Date(sessionStart.getTime() - 60 * 1000).toISOString(),
          rangeEnd: new Date(sessionEnd.getTime() + 60 * 1000).toISOString(),
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query, variables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: {
          listAttendanceSessionsByCoach?: Array<{
            sessionId: number;
            seriesId: number;
            seriesTitle: string | null;
            startTime: string;
            endTime: string;
            locationText: string;
            status: SessionStatus;
          }>;
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const items = body.data?.listAttendanceSessionsByCoach ?? [];
      const hit = items.find((item) => item.sessionId === targetSessionId);
      expect(hit).toBeTruthy();
      expect(hit?.seriesId).toBe(seriesId);
      expect(hit?.seriesTitle).toBe(seriesTitle);
      expect(hit?.locationText).toBe('散打馆 A1 教室');
      expect(hit?.status).toBe(sessionStatus);
    });

    /**
     * 清理测试数据
     */
    afterAll(async () => {
      if (enrollmentId) {
        await dataSource.getRepository(ParticipationAttendanceRecordEntity).delete({
          enrollmentId,
        });
        await dataSource.getRepository(ParticipationEnrollmentEntity).delete({
          id: enrollmentId,
        });
      }
      await dataSource.getRepository(CourseSessionCoachEntity).delete({
        sessionId: targetSessionId,
        coachId,
      });
      await dataSource.getRepository(CourseSessionEntity).delete({ id: targetSessionId });
    });
  });

  describe('RecordSessionAttendance GraphQL - 正例 (e2e)', () => {
    let enrollmentId: number;

    beforeAll(async () => {
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const existed = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!existed) {
        const mutation = `
          mutation { enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 正例报名" }) { isNewlyCreated } }
        `;
        const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
        const body = res.body as unknown as {
          data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
          errors?: unknown;
        };
        if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      }
      const latest = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!latest) throw new Error('前置失败：未找到报名记录');
      enrollmentId = latest.id;
    });

    it('经理批量记录出勤：触发 AttendanceUpdated 并持久化', async () => {
      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '1.0',
              remark: 'by-manager',
            },
          ],
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data!.recordSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      // 再读点名视图校验持久化
      const query = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { rows { enrollmentId status countApplied } } }
      `;
      const read = await executeGql(app, { query, token: coachToken }).expect(200);
      const sheet = (
        read.body as {
          data?: {
            loadSessionAttendanceSheet?: {
              rows: Array<{ enrollmentId: number; status: string; countApplied: string }>;
            };
          };
        }
      ).data!.loadSessionAttendanceSheet!;
      const row = sheet.rows.find((r) => r.enrollmentId === enrollmentId)!;
      expect(row.status).toBe(ParticipationAttendanceStatus.PRESENT);
      expect(row.countApplied).toMatch(/^1\.0/);

      // 等待 Outbox 分发并检查队列状态
      await sleep(200);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.failed).toBe(0);
      }
    });

    it('教练批量记录出勤：触发 AttendanceUpdated 并持久化', async () => {
      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.EXCUSED,
              countApplied: '0.0',
              remark: 'by-coach',
            },
          ],
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data!.recordSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      // 再读点名视图校验持久化
      const query = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { rows { enrollmentId status countApplied } } }
      `;
      const read = await executeGql(app, { query, token: coachToken }).expect(200);
      const sheet = (
        read.body as {
          data?: {
            loadSessionAttendanceSheet?: {
              rows: Array<{ enrollmentId: number; status: string; countApplied: string }>;
            };
          };
        }
      ).data!.loadSessionAttendanceSheet!;
      const row = sheet.rows.find((r) => r.enrollmentId === enrollmentId)!;
      expect(row.status).toBe(ParticipationAttendanceStatus.EXCUSED);
      expect(row.countApplied).toMatch(/^0\.0/);

      // 等待 Outbox 分发并检查队列状态
      await sleep(200);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.failed).toBe(0);
      }
    });

    afterAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  describe('RecordSessionAttendance GraphQL - 负例 (e2e)', () => {
    let enrollmentId: number;

    beforeAll(async () => {
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const existed = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!existed) {
        const mutation = `
          mutation { enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 负例报名" }) { isNewlyCreated } }
        `;
        const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
        const body = res.body as unknown as {
          data?: { enrollLearnerToSession?: { isNewlyCreated: boolean } };
          errors?: unknown;
        };
        if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      }
      const latest = await enrRepo.findOne({ where: { sessionId, learnerId } });
      if (!latest) throw new Error('前置失败：未找到报名记录');
      enrollmentId = latest.id;
    });

    beforeEach(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid', { sid: sessionId })
        .execute();
    });

    it('教练尝试覆盖计次：应拒绝覆盖（忽略输入覆盖）', async () => {
      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '2.5',
              remark: 'coach-override',
            },
          ],
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data!.recordSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      // 再读点名视图，确认未应用覆盖计次（按学员默认计次）
      const query = `
        query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { rows { enrollmentId status countApplied } } }
      `;
      const read = await executeGql(app, { query, token: coachToken }).expect(200);
      const sheet = (
        read.body as {
          data?: {
            loadSessionAttendanceSheet?: {
              rows: Array<{ enrollmentId: number; status: string; countApplied: string }>;
            };
          };
        }
      ).data!.loadSessionAttendanceSheet!;
      const row = sheet.rows.find((r) => r.enrollmentId === enrollmentId)!;
      expect(row.status).toBe(ParticipationAttendanceStatus.PRESENT);
      expect(row.countApplied).toMatch(/^1\.0/);
    });

    it('已定稿后再次提交：应拒绝并返回 SESSION_LOCKED_FOR_ATTENDANCE', async () => {
      // 先写入一条出勤记录
      const first = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const vars1 = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '1.0',
              remark: 'lock-prepare',
            },
          ],
        },
      };
      const r1 = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: first, variables: vars1 })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const b1 = r1.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (b1.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(b1.errors)}`);

      // 通过 GraphQL 终审该节次出勤
      const finalizeMutation = `
        mutation Finalize($input: FinalizeSessionAttendanceInputGql!) {
          finalizeSessionAttendance(input: $input) { updatedCount }
        }
      `;
      const finalizeVariables = { input: { sessionId } };
      const finalizeRes = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: finalizeMutation, variables: finalizeVariables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const finalizeBody = finalizeRes.body as unknown as {
        data?: { finalizeSessionAttendance?: { updatedCount: number } };
        errors?: unknown;
      };
      if (finalizeBody.errors) {
        throw new Error(`GraphQL 错误: ${JSON.stringify(finalizeBody.errors)}`);
      }
      expect(finalizeBody.data!.finalizeSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      // 再次提交同记录，期望被拒绝
      const r2 = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: first, variables: vars1 })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const b2 = r2.body as unknown as {
        data?: unknown;
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(b2.errors).toBeDefined();
      const code = b2.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('SESSION_LOCKED_FOR_ATTENDANCE');
    });

    it('写入 enrollment 不属于该 session：应返回 OPERATION_NOT_ALLOWED', async () => {
      // 造一个其它节次的报名
      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const anotherSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: await getCoachIdByAccountId(
          dataSource,
          await getAccountIdByLoginName(dataSource, testAccountsConfig.coach.loginName),
        ),
        startOffsetMinutes: 5,
      });
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.customer.loginName,
      );
      const customerService = app.get<CustomerService>(CustomerService);
      const customer = await customerService.findByAccountId(customerAccountId);
      if (!customer) throw new Error('前置失败：未找到 Customer 身份');
      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      const crossEnr = await enrollmentService.create({
        sessionId: anotherSessionId,
        learnerId,
        customerId: customer.id,
        remark: 'cross-session-enroll',
      });
      const cross = await enrRepo.findOne({ where: { id: crossEnr.id } });
      if (!cross) throw new Error('前置失败：跨节次报名未找到');

      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId: cross.id,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '1.0',
              remark: 'wrong-session',
            },
          ],
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: unknown;
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      const code = body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ENROLLMENT_OPERATION_NOT_ALLOWED');

      // 清理跨节次报名，避免影响后续分组（时间冲突）
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', {
          sid: anotherSessionId,
          lid: learnerId,
        })
        .execute();
    });

    it('非法状态枚举：应返回 ATTENDANCE_INVALID_STATUS', async () => {
      const mutation = `
        mutation { recordSessionAttendance(input: { sessionId: ${sessionId}, items: [{ enrollmentId: ${enrollmentId}, status: "NOT_A_STATUS", countApplied: "1.0" }] }) { updatedCount unchangedCount } }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: unknown;
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      const code = body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ATTENDANCE_INVALID_STATUS');
    });

    it('未取消报名报 CANCELLED：应拒绝', async () => {
      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.CANCELLED,
              countApplied: '0.0',
              remark: 'cancelled-strict',
            },
          ],
        },
      };
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${coachToken}`)
        .expect(200);
      const body = res.body as unknown as {
        data?: unknown;
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      const code = body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('ENROLLMENT_OPERATION_NOT_ALLOWED');
    });

    it('重复提交同一批：unchangedCount 可能为 0（确认时间刷新），事件去重', async () => {
      const mutation = `
        mutation Record($input: RecordSessionAttendanceInputGql!) {
          recordSessionAttendance(input: $input) { updatedCount unchangedCount }
        }
      `;
      const variables = {
        input: {
          sessionId,
          items: [
            {
              enrollmentId,
              status: ParticipationAttendanceStatus.PRESENT,
              countApplied: '1.0',
              remark: 'dup-batch',
            },
          ],
        },
      };

      // 第一次提交
      const r1 = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const b1 = r1.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (b1.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(b1.errors)}`);
      expect(b1.data!.recordSessionAttendance!.updatedCount).toBeGreaterThanOrEqual(1);

      // 第二次提交（相同批次）
      const r2 = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: mutation, variables })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const b2 = r2.body as unknown as {
        data?: { recordSessionAttendance?: { updatedCount: number; unchangedCount: number } };
        errors?: unknown;
      };
      if (b2.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(b2.errors)}`);
      const second = b2.data!.recordSessionAttendance!;
      expect(second.updatedCount).toBeGreaterThanOrEqual(0);
      expect(second.unchangedCount).toBeGreaterThanOrEqual(0);

      // 等待 Outbox 分发并检查 store 情况（仅断言无失败）
      await sleep(200);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.failed).toBe(0);
      }
    });

    afterAll(async () => {
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationAttendanceRecordEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
      await dataSource
        .createQueryBuilder()
        .delete()
        .from(ParticipationEnrollmentEntity)
        .where('session_id = :sid AND learner_id = :lid', { sid: sessionId, lid: learnerId })
        .execute();
    });
  });

  describe('LoadSessionAttendanceSheet GraphQL - 负例 (e2e)', () => {
    let sessionIdNoData: number;
    let sessionIdNotLeadCoach: number;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let coachBToken: string;

    beforeAll(async () => {
      const coachAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.coach.loginName,
      );
      const coachId = await getCoachIdByAccountId(dataSource, coachAccountId);

      // 创建一个空数据节次（无 enrollment/attendance）
      sessionIdNoData = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: coachId,
        startOffsetMinutes: 1,
      });

      // 创建一个 leadCoachId 不匹配的节次
      sessionIdNotLeadCoach = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: coachId + 9999,
        startOffsetMinutes: 2,
      });

      // 创建第二个教练账号并登录（coachB）
      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const loginName = `testcoach_b_${Date.now()}`;
      const loginEmail = `${loginName}@example.com`;
      const temp = await accountRepo.save(
        accountRepo.create({
          loginName,
          loginEmail,
          loginPassword: 'temp',
          status: AccountStatus.ACTIVE,
          identityHint: IdentityTypeEnum.COACH,
        }),
      );
      const hashed = AccountService.hashPasswordWithTimestamp('testCoachB@2024', temp.createdAt);
      await accountRepo.update(temp.id, { loginPassword: hashed });
      await userInfoRepo.save(
        userInfoRepo.create({
          accountId: temp.id,
          nickname: `${loginName}_nickname`,
          email: loginEmail,
          accessGroup: [IdentityTypeEnum.COACH],
          metaDigest: [IdentityTypeEnum.COACH],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        }),
      );
      coachBToken = await login({ app, loginName, loginPassword: 'testCoachB@2024' });
    });

    it('非存在节次：admin 调用返回 SESSION_NOT_FOUND', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: 999999) { sessionId isFinalized rows { enrollmentId } } }`;
      const res = await executeGql(app, { query, token: adminToken }).expect(200);
      const body = res.body as unknown as {
        data?: unknown;
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      const code = body.errors?.[0]?.extensions?.errorCode;
      expect(code).toBe('SESSION_NOT_FOUND');
      expect(
        (body.data as { loadSessionAttendanceSheet?: unknown })?.loadSessionAttendanceSheet,
      ).toBeUndefined();
    });

    it('未登录访问：返回 UNAUTHENTICATED', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId } }`;
      const res = await executeGql(app, { query }).expect(200);
      const body = res.body as unknown as { errors?: Array<{ extensions?: { code?: string } }> };
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });

    it('无角色访问（emptyRoles）：返回 ACCESS_DENIED', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId } }`;
      const res = await executeGql(app, { query, token: emptyRolesToken }).expect(200);
      const body = res.body as unknown as {
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCESS_DENIED');
    });

    it('Guest 访问：返回 ACCESS_DENIED', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId } }`;
      const res = await executeGql(app, { query, token: guestToken }).expect(200);
      const body = res.body as unknown as {
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCESS_DENIED');
    });

    it('普通 coach 但不是本节次 leadCoach：返回 ACCESS_DENIED', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionIdNotLeadCoach}) { sessionId } }`;
      const res = await executeGql(app, { query, token: coachToken }).expect(200);
      const body = res.body as unknown as {
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCESS_DENIED');
    });

    it('有 coach 角色但没有 coach 身份：返回 ACCESS_DENIED', async () => {
      // 创建仅有 COACH 角色但无 CoachEntity 的账号并登录
      const accountRepo = dataSource.getRepository(AccountEntity);
      const userInfoRepo = dataSource.getRepository(UserInfoEntity);
      const loginName = `ghostcoach_${Date.now()}`;
      const loginEmail = `${loginName}@example.com`;
      const temp = await accountRepo.save(
        accountRepo.create({
          loginName,
          loginEmail,
          loginPassword: 'temp',
          status: AccountStatus.ACTIVE,
          identityHint: IdentityTypeEnum.COACH,
        }),
      );
      const hashed = AccountService.hashPasswordWithTimestamp('ghostCoach@2024', temp.createdAt);
      await accountRepo.update(temp.id, { loginPassword: hashed });
      await userInfoRepo.save(
        userInfoRepo.create({
          accountId: temp.id,
          nickname: `${loginName}_nickname`,
          email: loginEmail,
          accessGroup: [IdentityTypeEnum.COACH],
          metaDigest: [IdentityTypeEnum.COACH],
          notifyCount: 0,
          unreadCount: 0,
          userState: UserState.ACTIVE,
        }),
      );
      const ghostToken = await login({ app, loginName, loginPassword: 'ghostCoach@2024' });

      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionId}) { sessionId } }`;
      const res = await executeGql(app, { query, token: ghostToken }).expect(200);
      const body = res.body as unknown as {
        errors?: Array<{ extensions?: { errorCode?: string } }>;
      };
      expect(body.errors).toBeDefined();
      expect(body.errors?.[0]?.extensions?.errorCode).toBe('ACCESS_DENIED');
    });

    it('节次存在但 enrollment/attendance 为空：admin 成功返回空 rows', async () => {
      const query = `query { loadSessionAttendanceSheet(sessionId: ${sessionIdNoData}) { sessionId isFinalized rows { enrollmentId } } }`;
      const res = await executeGql(app, { query, token: adminToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          loadSessionAttendanceSheet?: {
            sessionId: number;
            isFinalized: boolean;
            rows: Array<{ enrollmentId: number }>;
          };
        };
        errors?: unknown;
      };
      expect(body.errors).toBeUndefined();
      const sheet = body.data?.loadSessionAttendanceSheet;
      expect(sheet).toBeDefined();
      expect(sheet?.isFinalized).toBe(false);
      expect(Array.isArray(sheet?.rows)).toBe(true);
      expect(sheet?.rows.length).toBe(0);
    });
  });
  /**
   * CancelEnrollmentUsecase 相关用例分组
   * - 取消报名触发 EnrollmentCancelled 并被 Outbox 消费
   * - 重复取消幂等：不触发 EnrollmentCancelled 新事件
   */
  describe('CancelEnrollmentUsecase', () => {
    let leadCoachIdForCancel: number;
    let regretSessionId: number;
    let regretExpiredSessionId: number;
    let adminPastSessionId: number;
    let regretExpiredEnrollmentId: number;
    let cancelEventEnrollmentId: number;
    const loadEnrollmentForCancel = async (): Promise<ParticipationEnrollmentEntity> => {
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrollmentRepo.findOne({ where: { sessionId, learnerId } });
      if (!enrollment) throw new Error('测试前置失败：未找到报名记录');
      return enrollment;
    };
    const loadSessionForCancel = async (): Promise<CourseSessionEntity> => {
      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const freshSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!freshSession) throw new Error('测试前置失败：未找到节次');
      return freshSession;
    };
    const updateLeaveCutoffOverride = async (hours: number | null): Promise<void> => {
      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      await sessionRepo.update({ id: sessionId }, { leaveCutoffHoursOverride: hours });
    };
    const executeManagerCancel = async (
      enrollmentId: number,
    ): Promise<{
      isUpdated: boolean;
      enrollment?: {
        id: number;
        status: ParticipationEnrollmentStatus;
        statusReason: ParticipationEnrollmentStatusReason | null;
      };
    }> => {
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { enrollmentId: ${enrollmentId}, reason: ADMIN_FORCE_CANCEL }) {
            isUpdated
            enrollment { id sessionId learnerId customerId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSessionEnrollment?: {
            isUpdated: boolean;
            enrollment?: {
              id: number;
              status: ParticipationEnrollmentStatus;
              statusReason: ParticipationEnrollmentStatusReason | null;
            };
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const result = body.data?.cancelSessionEnrollment;
      if (!result) throw new Error('测试前置失败：取消报名返回为空');
      return result;
    };
    const assertOutboxConsumed = async (baselineCalls: number): Promise<void> => {
      await sleep(250);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      expect(cancelHandler.calls).toBeGreaterThan(baselineCalls);
    };
    const computeOverrideHours = (freshSession: CourseSessionEntity): number => {
      const hoursUntilStart = Math.ceil(
        (freshSession.startTime.getTime() - Date.now()) / (3600 * 1000),
      );
      return hoursUntilStart + 1;
    };

    beforeAll(async () => {
      // 通过服务保障报名存在，避免 GraphQL 侧偶发校验干扰
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.customer.loginName,
      );
      const customerService = app.get<CustomerService>(CustomerService);
      const customer = await customerService.findByAccountId(customerAccountId);
      if (!customer) throw new Error('测试前置失败：未找到 Customer 身份');
      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      await enrollmentService.create({
        sessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 取消前置报名',
      });

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const baseSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!baseSession) throw new Error('测试前置失败：未找到基准节次');
      leadCoachIdForCancel = baseSession.leadCoachId;

      regretSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: leadCoachIdForCancel,
        startOffsetMinutes: 120,
      });
      regretExpiredSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: leadCoachIdForCancel,
        startOffsetMinutes: 240,
      });
      adminPastSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: leadCoachIdForCancel,
        startOffsetMinutes: -120,
      });

      const enrRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrRepo.delete({
        sessionId: In([regretSessionId, regretExpiredSessionId, adminPastSessionId]),
        learnerId,
      });
      await enrollmentService.create({
        sessionId: regretSessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E Customer 当场后悔报名',
      });
      const regretExpiredEnrollment = await enrollmentService.create({
        sessionId: regretExpiredSessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E Customer 超时撤销报名',
      });
      regretExpiredEnrollmentId = regretExpiredEnrollment.id;
      await enrollmentService.create({
        sessionId: adminPastSessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E Admin 纠错取消报名',
      });

      const cancelEventSessionId = await createTestSession(dataSource, {
        seriesId,
        leadCoachId: leadCoachIdForCancel,
        startOffsetMinutes: 180,
      });
      await enrRepo.delete({ sessionId: cancelEventSessionId, learnerId });
      const cancelEventEnrollment = await enrollmentService.create({
        sessionId: cancelEventSessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 取消报名触发事件前置报名',
      });
      cancelEventEnrollmentId = cancelEventEnrollment.id;
    });

    it('用户当场后悔：10 分钟内可 cancel（不做请假阈值判断）', async () => {
      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const freshSession = await sessionRepo.findOne({ where: { id: regretSessionId } });
      if (!freshSession) throw new Error('测试前置失败：未找到节次');

      const hoursUntilStart = Math.ceil(
        (freshSession.startTime.getTime() - Date.now()) / (3600 * 1000),
      );
      const overrideHours = hoursUntilStart + 1;
      await sessionRepo.update(
        { id: regretSessionId },
        { leaveCutoffHoursOverride: overrideHours },
      );

      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { sessionId: ${regretSessionId}, learnerId: ${learnerId}, reason: CUSTOMER_REGRET }) {
            isUpdated
            enrollment { id sessionId learnerId customerId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSessionEnrollment?: {
            isUpdated: boolean;
            enrollment: {
              sessionId: number;
              status: ParticipationEnrollmentStatus;
              statusReason: ParticipationEnrollmentStatusReason | null;
            };
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.cancelSessionEnrollment?.isUpdated).toBe(true);
      expect(body.data?.cancelSessionEnrollment?.enrollment.sessionId).toBe(regretSessionId);
      expect(body.data?.cancelSessionEnrollment?.enrollment.status).toBe(
        ParticipationEnrollmentStatus.CANCELED,
      );
      expect(body.data?.cancelSessionEnrollment?.enrollment.statusReason).toBe(
        ParticipationEnrollmentStatusReason.CUSTOMER_REGRET,
      );

      await sleep(250);
      expect(cancelHandler.calls).toBeGreaterThan(baselineCalls);
    });

    it('用户超过 10 分钟：不可 cancel', async () => {
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrollmentRepo
        .createQueryBuilder()
        .update(ParticipationEnrollmentEntity)
        .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where('id = :id', { id: regretExpiredEnrollmentId })
        .execute();

      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { enrollmentId: ${regretExpiredEnrollmentId}, reason: CUSTOMER_REGRET }) {
            isUpdated
            enrollment { id }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as { errors?: Array<{ message?: string }> };
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors?.[0]?.message ?? '').toContain('短时间内撤销');

      await sleep(250);
      expect(cancelHandler.calls).toBe(baselineCalls);
    });

    it('管理员超过 10 分钟：仍可 cancel', async () => {
      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { sessionId: ${regretExpiredSessionId}, learnerId: ${learnerId}, reason: ADMIN_FORCE_CANCEL }) {
            isUpdated
            enrollment { id sessionId learnerId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: adminToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSessionEnrollment?: {
            isUpdated: boolean;
            enrollment: {
              sessionId: number;
              learnerId: number;
              status: ParticipationEnrollmentStatus;
              statusReason: ParticipationEnrollmentStatusReason | null;
            };
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.cancelSessionEnrollment?.isUpdated).toBe(true);
      expect(body.data?.cancelSessionEnrollment?.enrollment.sessionId).toBe(regretExpiredSessionId);
      expect(body.data?.cancelSessionEnrollment?.enrollment.learnerId).toBe(learnerId);
      expect(body.data?.cancelSessionEnrollment?.enrollment.status).toBe(
        ParticipationEnrollmentStatus.CANCELED,
      );
      expect(body.data?.cancelSessionEnrollment?.enrollment.statusReason).toBe(
        ParticipationEnrollmentStatusReason.ADMIN_FORCE_CANCEL,
      );

      await sleep(250);
      expect(cancelHandler.calls).toBeGreaterThan(baselineCalls);
    });

    it('管理员纠错：允许对已开始节次执行 cancel', async () => {
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrollmentRepo.findOne({
        where: { sessionId: adminPastSessionId, learnerId },
      });
      if (!enrollment) throw new Error('测试前置失败：未找到报名记录');

      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { enrollmentId: ${enrollment.id}, reason: ADMIN_CORRECTION }) {
            isUpdated
            enrollment { id sessionId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: adminToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSessionEnrollment?: {
            isUpdated: boolean;
            enrollment: {
              sessionId: number;
              status: ParticipationEnrollmentStatus;
              statusReason: ParticipationEnrollmentStatusReason | null;
            };
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.cancelSessionEnrollment?.isUpdated).toBe(true);
      expect(body.data?.cancelSessionEnrollment?.enrollment.sessionId).toBe(adminPastSessionId);
      expect(body.data?.cancelSessionEnrollment?.enrollment.status).toBe(
        ParticipationEnrollmentStatus.CANCELED,
      );
      expect(body.data?.cancelSessionEnrollment?.enrollment.statusReason).toBe(
        ParticipationEnrollmentStatusReason.ADMIN_CORRECTION,
      );

      await sleep(250);
      expect(cancelHandler.calls).toBeGreaterThan(baselineCalls);
    });

    it('超过取消阈值：manager 仍可 cancel 并触发事件', async () => {
      const enrollment = await loadEnrollmentForCancel();
      const freshSession = await loadSessionForCancel();
      const overrideHours = computeOverrideHours(freshSession);
      await updateLeaveCutoffOverride(overrideHours);
      const baselineCalls = cancelHandler.calls;
      const result = await executeManagerCancel(enrollment.id);
      expect(result.isUpdated).toBe(true);
      expect(result.enrollment?.id).toBe(enrollment.id);
      expect(result.enrollment?.status).toBe(ParticipationEnrollmentStatus.CANCELED);
      expect(result.enrollment?.statusReason).toBe(
        ParticipationEnrollmentStatusReason.ADMIN_FORCE_CANCEL,
      );
      await assertOutboxConsumed(baselineCalls);
      await updateLeaveCutoffOverride(null);
    });

    it('取消报名触发 EnrollmentCancelled 并被 Outbox 消费', async () => {
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { enrollmentId: ${cancelEventEnrollmentId}, reason: CUSTOMER_REGRET }) {
            isUpdated
            enrollment { id sessionId learnerId customerId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSessionEnrollment?: {
            isUpdated: boolean;
            enrollment: {
              id: number;
              sessionId: number;
              learnerId: number;
              customerId: number;
              status: ParticipationEnrollmentStatus;
              statusReason: ParticipationEnrollmentStatusReason | null;
            };
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.cancelSessionEnrollment?.isUpdated).toBe(true);
      expect(body.data?.cancelSessionEnrollment?.enrollment.status).toBe(
        ParticipationEnrollmentStatus.CANCELED,
      );

      // 等待 Outbox 分发，并断言消费情况
      await sleep(300);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      expect(cancelHandler.calls).toBeGreaterThanOrEqual(1);
    });

    it('重复取消幂等：不触发新的 EnrollmentCancelled 事件', async () => {
      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSessionEnrollment(input: { enrollmentId: ${cancelEventEnrollmentId}, reason: CUSTOMER_REGRET }) {
            isUpdated
            enrollment { id sessionId learnerId customerId status statusReason }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: { cancelSessionEnrollment?: { isUpdated: boolean } };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.cancelSessionEnrollment?.isUpdated).toBe(false);

      await sleep(250);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      // 不产生新的事件消费
      expect(cancelHandler.calls).toBe(baselineCalls);
    });
  });

  describe('CancelSeriesEnrollmentUsecase', () => {
    let cancelSeriesId: number;
    let seriesEnrollmentSessionIds: number[] = [];
    let seriesEnrollmentIds: number[] = [];

    beforeAll(async () => {
      const catalogId = await ensureTestCatalog(dataSource);
      const managerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.manager.loginName,
      );
      const managerId = await getManagerIdByAccountId(dataSource, managerAccountId);
      cancelSeriesId = await createTestSeries(dataSource, catalogId, managerId);

      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.customer.loginName,
      );
      const customerService = app.get<CustomerService>(CustomerService);
      const customer = await customerService.findByAccountId(customerAccountId);
      if (!customer) throw new Error('测试前置失败：未找到 Customer 身份');

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const baseSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!baseSession) throw new Error('测试前置失败：未找到基准节次');

      const leadCoachId = baseSession.leadCoachId;
      const s1 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 80,
      });
      const s2 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 120,
      });
      const s3 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 160,
      });
      seriesEnrollmentSessionIds = [s1, s2, s3];

      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrollmentRepo.delete({ sessionId: In(seriesEnrollmentSessionIds), learnerId });

      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      const e1 = await enrollmentService.create({
        sessionId: s1,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 批量取消前置报名 1',
      });
      const e2 = await enrollmentService.create({
        sessionId: s2,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 批量取消前置报名 2',
      });
      const e3 = await enrollmentService.create({
        sessionId: s3,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 批量取消前置报名 3',
      });
      seriesEnrollmentIds = [e1.id, e2.id, e3.id];
    });

    afterAll(async () => {
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrollmentRepo.delete({ id: In(seriesEnrollmentIds) });

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      await sessionRepo.delete({ id: In(seriesEnrollmentSessionIds) });

      await dataSource.getRepository(CourseSeriesEntity).delete({ id: cancelSeriesId });
    });

    it('批量取消开课班报名：返回成功列表并更新报名状态', async () => {
      const baselineCalls = cancelHandler.calls;
      const reason = ParticipationEnrollmentStatusReason.ADMIN_FORCE_CANCEL;
      const mutation = `
        mutation {
          cancelSeriesEnrollment(input: { seriesId: ${cancelSeriesId}, learnerId: ${learnerId}, reason: ${reason} }) {
            canceledEnrollmentIds
            unchangedEnrollmentIds
            failed { enrollmentId code message }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSeriesEnrollment?: {
            canceledEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
            failed: Array<{ enrollmentId: number; code: string; message: string }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const r = body.data?.cancelSeriesEnrollment;
      expect(r).toBeTruthy();
      expect(new Set(r!.canceledEnrollmentIds)).toEqual(new Set(seriesEnrollmentIds));
      expect(r!.unchangedEnrollmentIds).toEqual([]);
      expect(r!.failed).toEqual([]);

      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const rows = await enrollmentRepo.find({ where: { id: In(seriesEnrollmentIds) } });
      expect(rows).toHaveLength(seriesEnrollmentIds.length);
      for (const row of rows) {
        expect(row.status).toBe(ParticipationEnrollmentStatus.CANCELED);
        expect(row.statusReason).toBe(reason);
      }

      await sleep(400);
      expect(cancelHandler.calls).toBeGreaterThan(baselineCalls);
    });

    it('重复批量取消幂等：返回空列表并不触发新事件', async () => {
      const baselineCalls = cancelHandler.calls;
      const mutation = `
        mutation {
          cancelSeriesEnrollment(input: { seriesId: ${cancelSeriesId}, learnerId: ${learnerId}, reason: ADMIN_FORCE_CANCEL }) {
            canceledEnrollmentIds
            unchangedEnrollmentIds
            failed { enrollmentId }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSeriesEnrollment?: {
            canceledEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      const r = body.data?.cancelSeriesEnrollment;
      expect(r).toBeTruthy();
      expect(r!.canceledEnrollmentIds).toEqual([]);
      expect(r!.unchangedEnrollmentIds).toEqual([]);

      await sleep(300);
      expect(cancelHandler.calls).toBe(baselineCalls);
    });
  });

  describe('CancelSeriesEnrollmentUsecase (customer)', () => {
    let cancelSeriesId: number;
    let sessionIds: number[] = [];
    let enrollmentIds: number[] = [];

    beforeAll(async () => {
      const catalogId = await ensureTestCatalog(dataSource);
      const managerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.manager.loginName,
      );
      const managerId = await getManagerIdByAccountId(dataSource, managerAccountId);
      cancelSeriesId = await createTestSeries(dataSource, catalogId, managerId);

      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.customer.loginName,
      );
      const customerService = app.get<CustomerService>(CustomerService);
      const customer = await customerService.findByAccountId(customerAccountId);
      if (!customer) throw new Error('测试前置失败：未找到 Customer 身份');

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const baseSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!baseSession) throw new Error('测试前置失败：未找到基准节次');

      const leadCoachId = baseSession.leadCoachId;
      const s1 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 90,
      });
      const s2 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 130,
      });
      const s3 = await createTestSession(dataSource, {
        seriesId: cancelSeriesId,
        leadCoachId,
        startOffsetMinutes: 170,
      });
      sessionIds = [s1, s2, s3];

      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrollmentRepo.delete({ sessionId: In(sessionIds), learnerId });

      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      const e1 = await enrollmentService.create({
        sessionId: s1,
        learnerId,
        customerId: customer.id,
        remark: 'E2E customer 批量取消前置报名 1',
      });
      const e2 = await enrollmentService.create({
        sessionId: s2,
        learnerId,
        customerId: customer.id,
        remark: 'E2E customer 批量取消前置报名 2',
      });
      const e3 = await enrollmentService.create({
        sessionId: s3,
        learnerId,
        customerId: customer.id,
        remark: 'E2E customer 批量取消前置报名 3',
      });
      enrollmentIds = [e1.id, e2.id, e3.id];
    });

    afterAll(async () => {
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      await enrollmentRepo.delete({ id: In(enrollmentIds) });

      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      await sessionRepo.delete({ id: In(sessionIds) });

      await dataSource.getRepository(CourseSeriesEntity).delete({ id: cancelSeriesId });
    });

    it('customer 在报名后 10 分钟内可批量撤销', async () => {
      const baselineCalls = cancelHandler.calls;
      const reason = ParticipationEnrollmentStatusReason.CUSTOMER_REGRET;
      const mutation = `
        mutation {
          cancelSeriesEnrollment(input: { seriesId: ${cancelSeriesId}, learnerId: ${learnerId}, reason: ${reason} }) {
            canceledEnrollmentIds
            unchangedEnrollmentIds
            failed { enrollmentId code message }
          }
        }
      `;
      const res = await executeGql(app, { query: mutation, token: customerToken }).expect(200);
      const body = res.body as unknown as {
        data?: {
          cancelSeriesEnrollment?: {
            canceledEnrollmentIds: number[];
            unchangedEnrollmentIds: number[];
            failed: Array<{ enrollmentId: number; code: string; message: string }>;
          };
        };
        errors?: unknown;
      };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);

      const r = body.data?.cancelSeriesEnrollment;
      expect(r).toBeTruthy();
      expect(new Set(r!.canceledEnrollmentIds)).toEqual(new Set(enrollmentIds));
      expect(r!.unchangedEnrollmentIds).toEqual([]);
      expect(r!.failed).toEqual([]);

      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const rows = await enrollmentRepo.find({ where: { id: In(enrollmentIds) } });
      expect(rows).toHaveLength(enrollmentIds.length);
      for (const row of rows) {
        expect(row.status).toBe(ParticipationEnrollmentStatus.CANCELED);
        expect(row.statusReason).toBe(reason);
      }

      await sleep(500);
      expect(cancelHandler.calls).toBeGreaterThanOrEqual(baselineCalls + enrollmentIds.length);
    });
  });

  /**
   * CloseSessionUsecase 相关用例分组
   * - 满足前置条件后结课成功，触发 SessionClosed 并被 Outbox 消费
   *   前置条件包含：
   *   - 节次至少存在一条出勤记录且全部定稿
   *   - 节次存在至少一条教练结算模板（session_coaches）
   */
  describe('CloseSessionUsecase', () => {
    beforeAll(async () => {
      // 通过服务保障报名存在
      const customerAccountId = await getAccountIdByLoginName(
        dataSource,
        testAccountsConfig.customer.loginName,
      );
      const customerService = app.get<CustomerService>(CustomerService);
      const customer = await customerService.findByAccountId(customerAccountId);
      if (!customer) throw new Error('测试前置失败：未找到 Customer 身份');
      const enrollmentService = app.get<ParticipationEnrollmentService>(
        ParticipationEnrollmentService,
      );
      await enrollmentService.create({
        sessionId,
        learnerId,
        customerId: customer.id,
        remark: 'E2E 结课前置报名',
      });
    });
    it('结课成功触发 SessionClosed 并被 Outbox 消费', async () => {
      // 1) 查询报名，写入已定稿的出勤记录
      const enrollmentRepo = dataSource.getRepository(ParticipationEnrollmentEntity);
      const enrollment = await enrollmentRepo.findOne({ where: { sessionId, learnerId } });
      if (!enrollment) throw new Error('测试前置失败：未找到报名记录');

      const attendRepo = dataSource.getRepository(ParticipationAttendanceRecordEntity);
      const existingAttend = await attendRepo.findOne({ where: { sessionId, learnerId } });
      if (!existingAttend) {
        await attendRepo.save(
          attendRepo.create({
            sessionId,
            learnerId,
            enrollmentId: enrollment.id,
            countApplied: '1.00',
            confirmedByCoachId: null,
            confirmedAt: null,
            finalizedBy: null,
            finalizedAt: new Date(),
            remark: 'E2E 结课前定稿',
          }),
        );
      } else if (!existingAttend.finalizedAt) {
        await attendRepo.update({ id: existingAttend.id }, { finalizedAt: new Date() });
      }

      // 2) 写入至少一条教练结算模板（使用主教练）
      const sessionRepo = dataSource.getRepository(CourseSessionEntity);
      const freshSession = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!freshSession) throw new Error('测试前置失败：未找到节次');
      const coachRepo = dataSource.getRepository(CourseSessionCoachEntity);
      const existingCoachTemplate = await coachRepo.findOne({ where: { sessionId } });
      if (!existingCoachTemplate) {
        await coachRepo.save(
          coachRepo.create({
            sessionId,
            coachId: freshSession.leadCoachId,
            teachingFeeAmount: '0.00',
            bonusAmount: '0.00',
            payoutNote: null,
            payoutFinalizedAt: null,
            createdBy: null,
            updatedBy: null,
          }),
        );
      }

      // 3) 执行 GraphQL 结课 Mutation（使用经理身份）
      const mutation = `
        mutation { closeSession(sessionId: ${sessionId}) }
      `;
      const res = await executeGql(app, { query: mutation, token: managerToken }).expect(200);
      const body = res.body as unknown as { data?: { closeSession?: boolean }; errors?: unknown };
      if (body.errors) throw new Error(`GraphQL 错误: ${JSON.stringify(body.errors)}`);
      expect(body.data?.closeSession).toBe(true);

      // 4) 校验节次状态已更新为 FINISHED
      const closed = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!closed) throw new Error('结课后未找到节次');
      expect(closed.status).toBe(SessionStatus.FINISHED);

      // 5) 等待 Outbox 分发，并断言消费情况
      await sleep(250);
      if ('snapshot' in store && typeof store.snapshot === 'function') {
        const snap = store.snapshot();
        expect(snap.queued).toBe(0);
        expect(snap.failed).toBe(0);
      }
      expect(closeHandler.calls).toBeGreaterThanOrEqual(1);
    });
  });
});
