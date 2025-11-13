// test/08-integration-events/outbox-dispatcher.e2e-spec.ts
import {
  buildEnvelope,
  type IntegrationEventEnvelope,
} from '@core/common/integration-events/events.types';
import type {
  IOutboxDispatcherPort,
  IOutboxStorePort,
  IOutboxWriterPort,
} from '@core/common/integration-events/outbox.port';
import { INTEGRATION_EVENTS_TOKENS } from '@modules/common/integration-events/events.tokens';
import {
  OutboxDispatcher,
  type IntegrationEventHandler,
} from '@modules/common/integration-events/outbox.dispatcher';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import type { App } from 'supertest/types';
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';

/**
 * 测试用 EnrollmentCreated 事件处理器
 * - 第一次调用抛错，之后成功，用于验证重试与退避
 */
class TestEnrollmentCreatedHandler implements IntegrationEventHandler {
  readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
  private callCount = 0;
  private failOnce = true;
  private readonly processedDedupKeys: string[] = [];

  /**
   * 处理集成事件
   * @param input 输入参数对象（只读事件信封）
   */
  async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
    // 显式 await，满足异步方法的规范要求
    await Promise.resolve();
    this.callCount += 1;
    if (input.envelope.dedupKey) {
      this.processedDedupKeys.push(input.envelope.dedupKey);
    }
    // 首次调用模拟失败，其后成功
    if (this.failOnce && this.callCount === 1) {
      throw new Error(`fail-once: ${input.envelope.dedupKey ?? 'no-dedup'}`);
    }
  }

  /** 重置状态（用于多用例独立执行） */
  reset(): void {
    this.callCount = 0;
    this.processedDedupKeys.length = 0;
  }

  /** 获取累计调用次数 */
  get calls(): number {
    return this.callCount;
  }

  /** 设置是否仅第一次失败（默认 true） */
  setFailOnce(enabled: boolean): void {
    this.failOnce = enabled;
  }

  /** 获取处理顺序的 dedupKey 列表（用于断言优先级） */
  get order(): ReadonlyArray<string> {
    return this.processedDedupKeys;
  }
}

describe('08-Integration-Events Outbox Dispatcher (e2e)', () => {
  let app: INestApplication<App>;
  let writer: IOutboxWriterPort;
  let store: IOutboxStorePort;
  let dispatcher: IOutboxDispatcherPort;
  const testHandler = new TestEnrollmentCreatedHandler();

  beforeAll(async () => {
    // 初始化 GraphQL Schema（与 AppModule 保持一致的启动环境）
    initGraphQLSchema();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // 覆盖集成事件处理器集合为测试处理器
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([testHandler])
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    writer = app.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    store = app.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);
    dispatcher = app.get<IOutboxDispatcherPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    testHandler.reset();
    testHandler.setFailOnce(true);
  });

  /** 简易异步等待 */
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  /**
   * 用例：入箱后应在退避一次后成功投递
   */
  it('入箱事件应在一次失败后重试成功并出队', async () => {
    testHandler.setFailOnce(true);
    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'e2e-001',
      payload: { by: 'dispatcher-e2e' },
      dedupKey: 'e2e-enrollment-001',
    });

    // 入箱一个事件
    await writer.enqueue({ envelope: env });

    // 等待两次调度周期（默认 1000 ms），确保至少一次重试后成功
    await sleep(2500);

    // 断言处理器被调用至少两次（一次失败 + 一次成功）
    expect(testHandler.calls).toBeGreaterThanOrEqual(2);

    // 若实现提供快照，验证队列已清空且无失败归档
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snap = store.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }
  });

  /**
   * 用例：批量入箱后应按 batchSize 分批处理（弱断言）
   * - 由于调度周期与退避可配置，这里做宽松时间窗口断言
   */
  it('批量入箱应在有限周期内全部出队', async () => {
    testHandler.setFailOnce(true);
    const envelopes: ReadonlyArray<IntegrationEventEnvelope> = Array.from({ length: 3 }).map(
      (_, i) =>
        buildEnvelope({
          type: 'EnrollmentCreated',
          aggregateType: 'Enrollment',
          aggregateId: `e2e-batch-${i + 1}`,
          payload: { batch: i + 1 },
          dedupKey: `e2e-enrollment-batch-${i + 1}`,
        }),
    );

    await writer.enqueueMany({ envelopes });
    await sleep(4000);

    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snap = store.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }

    // 至少每个事件被调用一次（考虑第一次失败的重试，累计更高）
    expect(testHandler.calls).toBeGreaterThanOrEqual(envelopes.length);
  });

  /**
   * 用例：优先级应影响处理顺序（数值越大越先处理）
   */
  it('优先级高的事件应优先处理', async () => {
    testHandler.setFailOnce(false);
    const high = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'prio-high',
      payload: { level: 'high' },
      dedupKey: 'prio-high',
      priority: 10,
    });
    const low = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'prio-low',
      payload: { level: 'low' },
      dedupKey: 'prio-low',
      priority: 0,
    });

    await writer.enqueueMany({ envelopes: [low, high] });
    await sleep(1500);

    expect(testHandler.order.length).toBeGreaterThanOrEqual(2);
    expect(testHandler.order[0]).toBe('prio-high');
  });

  /**
   * 用例：延迟投递（deliverAfter）应在指定时间到达后才处理
   */
  it('延迟投递的事件在 deliverAfter 到达后才处理', async () => {
    testHandler.setFailOnce(false);
    const deliverAt = new Date(Date.now() + 1500);
    const delayed = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'delayed-01',
      payload: { delayed: true },
      dedupKey: 'delayed-01',
      deliverAfter: deliverAt,
    });

    await writer.enqueue({ envelope: delayed });

    // 在到达前应未处理，队列仍有项目
    await sleep(800);
    expect(testHandler.calls).toBe(0);
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snapEarly = store.snapshot();
      expect(snapEarly.queued).toBe(1);
    }

    // 到达后应在下一周期处理
    await sleep(1500);
    expect(testHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snapLate = store.snapshot();
      expect(snapLate.queued).toBe(0);
      expect(snapLate.failed).toBe(0);
    }
  });

  /**
   * 用例：显式停止调度后不应处理，重新启动后应继续处理
   */
  it('停止后不处理，启动后继续处理', async () => {
    testHandler.setFailOnce(false);
    await dispatcher.stop();

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'stop-start-01',
      payload: { case: 'stop-start' },
      dedupKey: 'stop-start-01',
    });

    await writer.enqueue({ envelope: env });
    await sleep(1500);
    expect(testHandler.calls).toBe(0);
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snapStop = store.snapshot();
      expect(snapStop.queued).toBe(1);
    }

    await dispatcher.start();
    await sleep(1500);
    expect(testHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store && typeof store.snapshot === 'function') {
      const snapStart = store.snapshot();
      expect(snapStart.queued).toBe(0);
    }
  });

  /**
   * 用例：禁用调度（INTEV_ENABLED=false）时队列不应被消费
   * - 通过单独应用实例覆盖配置验证
   */
  it('禁用调度时队列保持不动', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([new TestEnrollmentCreatedHandler()])
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
      .useFactory({
        factory: (
          config: ConfigService,
          storePort: IOutboxStorePort,
          handlers: ReadonlyArray<IntegrationEventHandler>,
        ) => {
          const proxyConfig: ConfigService = {
            // 仅覆盖 INTEV_ENABLED，其余委托给原始 ConfigService 并做默认值兜底
            get<T = unknown>(key: string, defaultValue?: T): T {
              if (key === 'INTEV_ENABLED') return 'false' as unknown as T;
              const v = config.get<T>(key);
              return v ?? (defaultValue as T);
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

    const app2 = moduleFixture.createNestApplication();
    await app2.init();
    const writer2 = app2.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    const store2 = app2.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'enabled-false-01',
      payload: { case: 'enabled-false' },
      dedupKey: 'enabled-false-01',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(1500);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(1);
      expect(snap.failed).toBe(0);
    }
    await app2.close();
  });

  /**
   * 用例：无处理器时应直接标记成功（不归档失败）
   */
  it('无处理器时事件应被标记成功并移出队列', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([])
      .compile();

    const app2 = moduleFixture.createNestApplication();
    await app2.init();
    const writer2 = app2.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    const store2 = app2.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'no-handler-01',
      payload: { case: 'no-handler' },
      dedupKey: 'no-handler-01',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(1500);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }

    await app2.close();
  });

  /**
   * 用例：达到最大重试次数后归档失败
   * - 单独应用实例，覆盖退避与最大次数为小值，加速验证
   */
  it('达到最大重试次数后应归档失败', async () => {
    class AlwaysFailHandler implements IntegrationEventHandler {
      readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
      async handle(): Promise<void> {
        await Promise.resolve();
        throw new Error('always-fail');
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([new AlwaysFailHandler()])
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
      .useFactory({
        factory: (
          config: ConfigService,
          storePort: IOutboxStorePort,
          handlers: ReadonlyArray<IntegrationEventHandler>,
        ) => {
          const proxyConfig: ConfigService = {
            get<T = unknown>(key: string, defaultValue?: T): T {
              if (key === 'INTEV_MAX_ATTEMPTS') return 2 as unknown as T;
              if (key === 'INTEV_BACKOFF_SERIES') return [50, 50] as unknown as T;
              if (key === 'INTEV_DISPATCH_INTERVAL_MS') return 50 as unknown as T;
              const v = config.get<T>(key);
              return v ?? (defaultValue as T);
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

    const app2 = moduleFixture.createNestApplication();
    await app2.init();
    const writer2 = app2.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    const store2 = app2.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'max-attempts-01',
      payload: { case: 'max-attempts' },
      dedupKey: 'max-attempts-01',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(400);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(1);
    }

    await app2.close();
  });

  /**
   * 用例：同类型多处理器顺序执行；任一处理器失败则整体重试
   * - 验证多播语义：两个处理器按顺序执行，第二个首次失败导致整体重试
   */
  it('同类型多处理器按顺序执行，失败短路并整体重试', async () => {
    /**
     * 第一处理器：记录调用次数与顺序
     * @param input 输入参数对象（只读事件信封）
     */
    class FirstRecordHandler implements IntegrationEventHandler {
      readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
      private count = 0;
      async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
        await Promise.resolve();
        void input.envelope; // 使用以满足 ESLint
        this.count += 1;
      }
      get calls(): number {
        return this.count;
      }
    }

    /**
     * 第二处理器：仅第一次调用失败，后续成功
     * @param input 输入参数对象（只读事件信封）
     */
    class SecondFailOnceHandler implements IntegrationEventHandler {
      readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
      private count = 0;
      private failOnce = true;
      async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
        await Promise.resolve();
        void input.envelope;
        this.count += 1;
        if (this.failOnce && this.count === 1) {
          throw new Error('second-fail-once');
        }
      }
      get calls(): number {
        return this.count;
      }
    }

    const h1 = new FirstRecordHandler();
    const h2 = new SecondFailOnceHandler();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([h1, h2])
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
      .useFactory({
        factory: (
          config: ConfigService,
          storePort: IOutboxStorePort,
          handlers: ReadonlyArray<IntegrationEventHandler>,
        ) => {
          const proxyConfig: ConfigService = {
            get<T = unknown>(key: string, defaultValue?: T): T {
              if (key === 'INTEV_BACKOFF_SERIES') return [50] as unknown as T;
              if (key === 'INTEV_DISPATCH_INTERVAL_MS') return 50 as unknown as T;
              const v = config.get<T>(key);
              return v ?? (defaultValue as T);
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

    const app2 = moduleFixture.createNestApplication();
    await app2.init();
    const writer2 = app2.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    const store2 = app2.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'multi-01',
      payload: { case: 'multi-handlers' },
      dedupKey: 'multi-01',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(300);
    // 第一次分发：h1 调用 + h2 失败；第二次重试：h1 调用 + h2 成功
    expect(h1.calls).toBeGreaterThanOrEqual(2);
    expect(h2.calls).toBeGreaterThanOrEqual(2);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }

    await app2.close();
  });

  /**
   * 用例：入队轻量去重；成功后清理再允许入队同 dedupKey
   * - 验证内存版 enqueue 去重与成功后清理逻辑
   */
  it('入队轻量去重，成功后可再次入队同 key', async () => {
    // 使用始终成功的处理器，避免首次失败导致退避等待影响断言
    class AlwaysSuccessHandler implements IntegrationEventHandler {
      readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
      /** 处理集成事件（不抛错） */
      async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
        await Promise.resolve();
        void input.envelope;
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
      .useValue([new AlwaysSuccessHandler()])
      // 覆盖调度器端口，缩短轮询间隔，避免默认 1000 ms 导致断言时间窗不足
      .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
      .useFactory({
        factory: (
          config: ConfigService,
          storePort: IOutboxStorePort,
          handlers: ReadonlyArray<IntegrationEventHandler>,
        ) => {
          const proxyConfig: ConfigService = {
            get<T = unknown>(key: string, defaultValue?: T): T {
              if (key === 'INTEV_DISPATCH_INTERVAL_MS') return 50 as unknown as T;
              const v = config.get<T>(key);
              return (v ?? defaultValue) as T;
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

    const app2 = moduleFixture.createNestApplication();
    await app2.init();
    const writer2 = app2.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
    const store2 = app2.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);
    const dispatcher2 = app2.get<IOutboxDispatcherPort>(
      INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT,
    );

    // 先停止调度器，观察入队层面的去重效果
    await dispatcher2.stop();
    const env1 = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'dedup-01',
      payload: { case: 'dedup' },
      dedupKey: 'dedup-01',
    });
    const env2 = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'dedup-01',
      payload: { case: 'dedup' },
      dedupKey: 'dedup-01',
    });
    await writer2.enqueue({ envelope: env1 });
    await writer2.enqueue({ envelope: env2 });
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(1);
      expect(snap.failed).toBe(0);
    }

    // 启动调度器，处理完毕后再次入队同 key，应成功处理
    await dispatcher2.start();
    await sleep(400);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapAfter = store2.snapshot();
      expect(snapAfter.queued).toBe(0);
    }
    await writer2.enqueue({ envelope: env1 });
    await sleep(400);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapAfterSecond = store2.snapshot();
      expect(snapAfterSecond.queued).toBe(0);
      expect(snapAfterSecond.failed).toBe(0);
    }

    await app2.close();
  });
});
