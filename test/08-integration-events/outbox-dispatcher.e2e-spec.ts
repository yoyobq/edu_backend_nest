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
import { initGraphQLSchema } from '../../src/adapters/graphql/schema/schema.init';

/**
 * 测试辅助：创建覆盖了处理器与配置的局部应用实例
 * - 通过 configPatch 覆盖部分配置键，减少重复样板代码
 * - 返回 app 与相关端口，调用 close 以关闭实例
 */
async function withApp(input: {
  readonly handlers: ReadonlyArray<IntegrationEventHandler>;
  readonly configPatch?: Readonly<Record<string, unknown>>;
}): Promise<{
  readonly app: INestApplication;
  readonly writer: IOutboxWriterPort;
  readonly store: IOutboxStorePort;
  readonly dispatcher: IOutboxDispatcherPort;
  readonly close: () => Promise<void>;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(INTEGRATION_EVENTS_TOKENS.HANDLERS)
    .useValue(input.handlers)
    .overrideProvider(INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT)
    .useFactory({
      factory: (
        config: ConfigService,
        storePort: IOutboxStorePort,
        handlers: ReadonlyArray<IntegrationEventHandler>,
      ) => {
        const proxyConfig: ConfigService = {
          /**
           * 配置覆盖：若命中 configPatch，则返回覆写值；否则回退原始配置
           */
          get<T = unknown>(key: string, defaultValue?: T): T {
            const patched = (input.configPatch?.[key] ?? undefined) as T | undefined;
            if (patched !== undefined) return patched;
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

  const app = moduleFixture.createNestApplication();
  await app.init();
  const writer = app.get<IOutboxWriterPort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT);
  const store = app.get<IOutboxStorePort>(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT);
  const dispatcher = app.get<IOutboxDispatcherPort>(
    INTEGRATION_EVENTS_TOKENS.OUTBOX_DISPATCHER_PORT,
  );
  return {
    app,
    writer,
    store,
    dispatcher,
    close: async () => {
      await app.close();
    },
  };
}

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
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let writer: IOutboxWriterPort;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let store: IOutboxStorePort;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(true);
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_BACKOFF_SERIES: [50, 50], INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'e2e-001',
      payload: { by: 'dispatcher-e2e' },
      dedupKey: 'e2e-enrollment-001',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(350);
    expect(localHandler.calls).toBeGreaterThanOrEqual(2);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }
    await close();
  });

  /**
   * 用例：批量入箱后应按 batchSize 分批处理（弱断言）
   * - 由于调度周期与退避可配置，这里做宽松时间窗口断言
   */
  it('批量入箱应在有限周期内全部出队', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(true);
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_BACKOFF_SERIES: [50, 50], INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

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

    await writer2.enqueueMany({ envelopes });
    await sleep(500);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }
    expect(localHandler.calls).toBeGreaterThanOrEqual(envelopes.length);
    await close();
  });

  /**
   * 用例：优先级应影响处理顺序（数值越大越先处理）
   */
  it('优先级高的事件应优先处理', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const { writer: writer2, close } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

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

    await writer2.enqueueMany({ envelopes: [low, high] });
    // 等待少量调度周期以完成处理顺序断言
    await sleep(300);

    expect(localHandler.order.length).toBeGreaterThanOrEqual(2);
    expect(localHandler.order[0]).toBe('prio-high');
    await close();
  });

  /**
   * 用例：延迟投递（deliverAfter）应在指定时间到达后才处理
   */
  it('延迟投递的事件在 deliverAfter 到达后才处理', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    const deliverAt = new Date(Date.now() + 200);
    const delayed = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'delayed-01',
      payload: { delayed: true },
      dedupKey: 'delayed-01',
      deliverAfter: deliverAt,
    });

    await writer2.enqueue({ envelope: delayed });

    // 到达前：未处理，队列仍有项目
    await sleep(80);
    expect(localHandler.calls).toBe(0);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapEarly = store2.snapshot();
      expect(snapEarly.queued).toBe(1);
    }

    // 到达后：处理完成，队列清空
    await sleep(300);
    expect(localHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapLate = store2.snapshot();
      expect(snapLate.queued).toBe(0);
      expect(snapLate.failed).toBe(0);
    }
    await close();
  });

  /**
   * 用例：显式停止调度后不应处理，重新启动后应继续处理
   */
  it('停止后不处理，启动后继续处理', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const {
      writer: writer2,
      store: store2,
      dispatcher: dispatcher2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    await dispatcher2.stop();

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'stop-start-01',
      payload: { case: 'stop-start' },
      dedupKey: 'stop-start-01',
    });

    await writer2.enqueue({ envelope: env });
    await sleep(200);
    expect(localHandler.calls).toBe(0);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapStop = store2.snapshot();
      expect(snapStop.queued).toBe(1);
    }

    await dispatcher2.start();
    await sleep(250);
    expect(localHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapStart = store2.snapshot();
      expect(snapStart.queued).toBe(0);
    }
    await close();
  });

  /**
   * 用例：deliverAfter 在过去的时间点应立即可处理
   * - 构造 deliverAfter 为过去时间，验证在短调度周期下快速出队
   */
  it('deliverAfter 过去时间点立即处理', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    const past = new Date(Date.now() - 500);
    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'deliver-past-01',
      payload: { case: 'deliver-past' },
      dedupKey: 'deliver-past-01',
      deliverAfter: past,
    });

    await writer2.enqueue({ envelope: env });
    // 短暂等待一到两个调度周期
    await sleep(150);
    expect(localHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }
    await close();
  });

  /**
   * 用例：同优先级下按 nextAttemptAt 先后顺序处理
   * - 两个事件优先级相同，deliverAfter 均为过去但先后不同，断言处理顺序
   */
  it('同优先级按 nextAttemptAt 先后处理', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const { writer: writer2, close } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    const earlier = new Date(Date.now() - 400);
    const later = new Date(Date.now() - 200);
    const e1 = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'order-early',
      payload: { order: 'early' },
      dedupKey: 'order-early',
      deliverAfter: earlier,
      priority: 0,
    });
    const e2 = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'order-late',
      payload: { order: 'late' },
      dedupKey: 'order-late',
      deliverAfter: later,
      priority: 0,
    });

    await writer2.enqueueMany({ envelopes: [e2, e1] });
    // 等待处理完成
    await sleep(300);
    expect(localHandler.order.length).toBeGreaterThanOrEqual(2);
    expect(localHandler.order[0]).toBe('order-early');
    await close();
  });

  /**
   * 用例：start() 的幂等性（重复 start 不应产生多个计时器）
   * - 停止后重复调用 start，再次停止；入队后应保持不处理（若产生多计时器则会误处理）
   */
  it('start() 幂等：重复 start 不产生多计时器', async () => {
    const localHandler = new TestEnrollmentCreatedHandler();
    localHandler.setFailOnce(false);
    const {
      writer: writer2,
      store: store2,
      dispatcher: dispatcher2,
      close,
    } = await withApp({
      handlers: [localHandler],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

    // 先停止，再重复启动，随后再次停止
    await dispatcher2.stop();
    await dispatcher2.start();
    await dispatcher2.start();
    await dispatcher2.stop();

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'start-idem-01',
      payload: { case: 'start-idempotency' },
      dedupKey: 'start-idem-01',
    });

    await writer2.enqueue({ envelope: env });
    // 停止状态下等待若干周期，不应被处理
    await sleep(250);
    expect(localHandler.calls).toBe(0);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapStop = store2.snapshot();
      expect(snapStop.queued).toBe(1);
    }

    // 再次启动后应正常处理
    await dispatcher2.start();
    await sleep(250);
    expect(localHandler.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snapStart = store2.snapshot();
      expect(snapStart.queued).toBe(0);
      expect(snapStart.failed).toBe(0);
    }
    await close();
  });

  /**
   * 用例：禁用调度（INTEV_ENABLED=false）时队列不应被消费
   * - 通过单独应用实例覆盖配置验证
   */
  it('禁用调度时队列保持不动', async () => {
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [new TestEnrollmentCreatedHandler()],
      configPatch: { INTEV_ENABLED: 'false' },
    });

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
    await close();
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
    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [new AlwaysFailHandler()],
      configPatch: {
        INTEV_MAX_ATTEMPTS: 2,
        INTEV_BACKOFF_SERIES: [50, 50],
        INTEV_DISPATCH_INTERVAL_MS: 50,
      },
    });

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

    await close();
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

    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [h1, h2],
      configPatch: { INTEV_BACKOFF_SERIES: [50], INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

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

    await close();
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

    const {
      writer: writer2,
      store: store2,
      dispatcher: dispatcher2,
      close,
    } = await withApp({
      handlers: [new AlwaysSuccessHandler()],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 50 },
    });

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

    await close();
  });

  /**
   * 用例：非重入护栏（慢处理器在短周期调度下也不并发执行）
   * - 将 INTEV_DISPATCH_INTERVAL_MS 设为 20 ms
   * - 构造一个耗时 ~100 ms 的处理器，断言不会并发执行（overlap 为 0）
   */
  it('非重入护栏：慢处理器不应被并发处理', async () => {
    /**
     * 慢处理器：进入时标记 inProgress，以检测是否存在并发重入
     * @param input 输入参数对象（只读事件信封）
     */
    class SlowNonReentrantHandler implements IntegrationEventHandler {
      readonly type: IntegrationEventEnvelope['type'] = 'EnrollmentCreated';
      private inProgress = false;
      private overlap = 0;
      private count = 0;
      async handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void> {
        await Promise.resolve();
        void input.envelope;
        if (this.inProgress) this.overlap += 1;
        this.inProgress = true;
        // 模拟耗时处理，验证短调度周期下无并发重入
        await sleep(100);
        this.count += 1;
        this.inProgress = false;
      }
      /** 获取累计调用次数 */
      get calls(): number {
        return this.count;
      }
      /** 获取重入计数（应为 0） */
      get overlaps(): number {
        return this.overlap;
      }
    }

    const h = new SlowNonReentrantHandler();

    const {
      writer: writer2,
      store: store2,
      close,
    } = await withApp({
      handlers: [h],
      configPatch: { INTEV_DISPATCH_INTERVAL_MS: 20, INTEV_BACKOFF_SERIES: [20, 20] },
    });

    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: 'non-reentrant-01',
      payload: { case: 'non-reentrant' },
      dedupKey: 'non-reentrant-01',
    });

    await writer2.enqueue({ envelope: env });
    // 等待若干调度周期以完成一次处理
    await sleep(250);

    // 不发生并发重入，overlaps 应为 0；至少发生一次调用
    expect(h.overlaps).toBe(0);
    expect(h.calls).toBeGreaterThanOrEqual(1);
    if ('snapshot' in store2 && typeof store2.snapshot === 'function') {
      const snap = store2.snapshot();
      expect(snap.queued).toBe(0);
      expect(snap.failed).toBe(0);
    }

    await close();
  });
});
