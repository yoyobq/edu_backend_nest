// 文件位置：/var/www/backend/test/08-integration-events/course-workflows.e2e-spec.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import { CourseLevel } from '@app-types/models/course.types';
import { type IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import type { IOutboxStorePort } from '@core/common/integration-events/outbox.port';
import { INTEGRATION_EVENTS_TOKENS } from '@modules/common/integration-events/events.tokens';
import {
  type IntegrationEventHandler,
  OutboxDispatcher,
} from '@modules/common/integration-events/outbox.dispatcher';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { LearnerEntity } from '@src/modules/account/identities/training/learner/account-learner.entity';
import { ManagerEntity } from '@src/modules/account/identities/training/manager/account-manager.entity';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { AudienceTypeEnum, LoginTypeEnum } from '@src/types/models/account.types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';
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
  const res = await request(opts.app.getHttpServer())
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
          loginName: opts.loginName,
          loginPassword: opts.loginPassword,
          type: LoginTypeEnum.PASSWORD,
          audience: AudienceTypeEnum.DESKTOP,
        },
      },
    })
    .expect(200);
  const body = res.body as unknown as { data: { login: { accessToken: string } } };
  return body.data.login.accessToken;
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
 * 创建一个测试课程系列并返回其 ID
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
      title: `E2E 系列 ${Date.now()}`,
      description: '课程工作流自动化测试系列',
      venueType: VenueType.SANDA_GYM,
      classMode: ClassMode.SMALL_CLASS,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      recurrenceRule: null,
      leaveCutoffHours: 12,
      pricePerSession: '100.00',
      teachingFeeRef: '80.00',
      maxLearners: 8,
      status: CourseSeriesStatus.PLANNED,
      remark: 'E2E 工作流用系列',
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
async function createTestSession(
  ds: DataSource,
  params: {
    readonly seriesId: number;
    readonly leadCoachId: number;
  },
): Promise<number> {
  const repo = ds.getRepository(CourseSessionEntity);
  const start = new Date(Date.now() + 48 * 3600 * 1000);
  const end = new Date(Date.now() + 49 * 3600 * 1000);
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
  const req = request(app.getHttpServer()).post('/graphql').send({ query: params.query });
  if (params.token) req.set('Authorization', `Bearer ${params.token}`);
  return req;
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

  let customerToken: string;
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
    // Outbox Dispatcher 由模块生命周期自动启动，测试无需直接持有引用

    // 清理并造数：创建 manager / coach / customer / learner
    await cleanupTestAccounts(dataSource);
    await seedTestAccounts({
      dataSource,
      createAccountUsecase: null,
      includeKeys: ['manager', 'coach', 'customer', 'learner'],
    });

    // 登录客户账号，作为自助报名发起者
    customerToken = await login({
      app,
      loginName: testAccountsConfig.customer.loginName,
      loginPassword: testAccountsConfig.customer.loginPassword,
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
   * 用例：新报名触发 IntegrationEvent 并被调度器消费
   */
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
            isCanceled
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
            isCanceled: 0 | 1;
            remark: string | null;
          };
        };
      };
    };

    expect(body.data.enrollLearnerToSession.isNewlyCreated).toBe(true);
    expect(body.data.enrollLearnerToSession.enrollment.sessionId).toBe(sessionId);
    expect(body.data.enrollLearnerToSession.enrollment.learnerId).toBe(learnerId);
    // 等待调度器消化事件
    await sleep(350);
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snap = store.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }
    expect(handler.calls).toBeGreaterThanOrEqual(1);
  });

  /**
   * 用例：重复报名幂等返回 isNewlyCreated=false，不触发新事件
   */
  it('重复报名幂等：不触发 EnrollmentCreated 事件', async () => {
    const baselineCalls = handler.calls;
    const mutation = `
      mutation {
        enrollLearnerToSession(input: { sessionId: ${sessionId}, learnerId: ${learnerId}, remark: "E2E 重复报名" }) {
          isNewlyCreated
          enrollment { id sessionId learnerId customerId isCanceled remark }
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
    // 调度器无新增消费（用例只在新建报名时入箱）
    expect(handler.calls).toBe(baselineCalls);
  });
});
