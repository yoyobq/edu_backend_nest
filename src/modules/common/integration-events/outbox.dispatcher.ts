// src/modules/common/integration-events/outbox.dispatcher.ts
import type { IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import type {
  IOutboxDispatcherPort,
  IOutboxStorePort,
} from '@core/common/integration-events/outbox.port';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INTEGRATION_EVENTS_TOKENS } from './events.tokens';

/**
 * 事件处理器接口
 */
export interface IntegrationEventHandler {
  readonly type: IntegrationEventEnvelope['type'];
  handle(input: { readonly envelope: IntegrationEventEnvelope }): Promise<void>;
}

/**
 * 内存 Outbox 调度器：定期拉取就绪事件并分发给处理器
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy, IOutboxDispatcherPort {
  private timer: NodeJS.Timeout | null = null;
  private readonly maxAttempts: number;
  private readonly backoffSeries: ReadonlyArray<number>;
  private readonly batchSize: number;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private isTicking = false;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_STORE_PORT)
    private readonly store: IOutboxStorePort,
    @Inject(INTEGRATION_EVENTS_TOKENS.HANDLERS)
    private readonly handlers: ReadonlyArray<IntegrationEventHandler>,
  ) {
    // 显式归一配置类型，避免隐式类型转换带来的行为偏差
    const toNum = (v: unknown, d: number): number => {
      if (v == null) return d;
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };

    // 显式声明泛型，避免 `any`
    const rawEnabled = this.config.get<string>('INTEV_ENABLED', 'true');
    const rawBatchSize = this.config.get<string | number>('INTEV_BATCH_SIZE');
    const rawMaxAttempts = this.config.get<string | number>('INTEV_MAX_ATTEMPTS');
    const rawIntervalMs = this.config.get<string | number>('INTEV_DISPATCH_INTERVAL_MS');
    const seriesRaw = this.config.get<ReadonlyArray<number | string> | undefined>(
      'INTEV_BACKOFF_SERIES',
    );

    this.enabled = String(rawEnabled).toLowerCase() !== 'false';
    this.batchSize = toNum(rawBatchSize, 100);
    this.maxAttempts = toNum(rawMaxAttempts, 5);
    this.intervalMs = toNum(rawIntervalMs, 1000);

    const defaultSeries: ReadonlyArray<number> = [1000, 5000, 30000, 120000, 600000];
    const parsedSeries: ReadonlyArray<number> = Array.isArray(seriesRaw)
      ? seriesRaw.map((v) => toNum(v, 0))
      : defaultSeries;
    this.backoffSeries = parsedSeries;
  }

  /**
   * 模块初始化：按配置启动调度器
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    this.running = true;
    this.scheduleNextTick();
    await Promise.resolve();
  }

  /**
   * 模块销毁：停止调度器
   */
  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isTicking = false;
    await Promise.resolve();
  }

  /**
   * 处理一个调度周期
   * - 支持同事件类型的多个处理器，按顺序执行（多播）
   * - 任一处理器失败则触发整条事件的重试（幂等前提下安全）
   */
  private async tick(): Promise<void> {
    if (this.isTicking) return; // 防止并发重入
    this.isTicking = true;
    try {
      const ready = this.store.pullReady(this.batchSize);
      for (const item of ready) {
        const matchedHandlers = this.handlers.filter((h) => h.type === item.envelope.type);
        if (matchedHandlers.length === 0) {
          // 无注册处理器，直接标记成功（占位行为）
          this.store.markSucceeded(item.envelope);
          continue;
        }
        let anyFailed = false;
        for (const handler of matchedHandlers) {
          try {
            await handler.handle({ envelope: item.envelope });
          } catch {
            anyFailed = true;
            break;
          }
        }
        if (anyFailed) {
          const attemptIdx = Math.min(item.attempts, this.backoffSeries.length - 1);
          const backoffMs =
            this.backoffSeries[attemptIdx] ?? this.backoffSeries[this.backoffSeries.length - 1];
          this.store.scheduleRetry(item.envelope, backoffMs, this.maxAttempts);
        } else {
          this.store.markSucceeded(item.envelope);
        }
      }
    } finally {
      this.isTicking = false;
      // 如果仍在运行，则安排下一次调度
      if (this.running) this.scheduleNextTick();
    }
  }

  /**
   * 手动启动调度器（与框架生命周期对齐；幂等）
   */
  async start(): Promise<void> {
    if (this.running) return;
    await this.onModuleInit();
  }

  /**
   * 手动停止调度器（与框架生命周期对齐；幂等）
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    await this.onModuleDestroy();
  }

  /**
   * 安排下一次调度（使用 setTimeout，自调度避免重入）
   */
  private scheduleNextTick(): void {
    if (!this.enabled || !this.running) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, this.intervalMs);
  }
}
