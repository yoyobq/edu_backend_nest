// src/modules/common/integration-events/outbox.memory.service.ts
import type { IntegrationEventEnvelope } from '@core/common/integration-events/events.types';
import type {
  IOutboxWriterPort,
  IOutboxStorePort,
  OutboxReadyItem,
  OutboxSnapshot,
  TxRef,
} from '@core/common/integration-events/outbox.port';
import { Injectable } from '@nestjs/common';

type QueuedEvent = {
  readonly envelope: IntegrationEventEnvelope;
  attempts: number;
  nextAttemptAt: number; // epoch ms
};

/**
 * 内存版 Outbox 服务（忽略 tx）
 * 同时实现 Writer + Store 端口，便于 Dispatcher 仅依赖 Store 抽象
 */
@Injectable()
export class OutboxMemoryService implements IOutboxWriterPort, IOutboxStorePort {
  private readonly queue: QueuedEvent[] = [];
  private readonly failed: QueuedEvent[] = [];
  // 轻量去重：记录已入队的 dedupKey（可选）
  private readonly dedupSet = new Set<string>();

  /**
   * 入箱单条事件
   * @param input 入参（可选 tx 与事件信封）
   */
  async enqueue(input: {
    readonly tx?: TxRef;
    readonly envelope: IntegrationEventEnvelope;
  }): Promise<void> {
    await Promise.resolve();
    const now = Date.now();
    const deliverAfterMs = input.envelope.deliverAfter
      ? Date.parse(input.envelope.deliverAfter)
      : now;
    // 轻量去重：若有 dedupKey 且已存在，则直接跳过（或覆盖 nextAttemptAt）
    const key = input.envelope.dedupKey;
    if (key && this.dedupSet.has(key)) {
      // 可选策略：覆盖已存在项的 nextAttemptAt（此处选择跳过，避免破坏排序）
      return;
    }
    if (key) this.dedupSet.add(key);
    this.queue.push({ envelope: input.envelope, attempts: 0, nextAttemptAt: deliverAfterMs });
  }

  /**
   * 入箱批量事件
   * @param input 入参（可选 tx 与事件信封列表）
   */
  async enqueueMany(input: {
    readonly tx?: TxRef;
    readonly envelopes: ReadonlyArray<IntegrationEventEnvelope>;
  }): Promise<void> {
    await Promise.resolve();
    const now = Date.now();
    for (const env of input.envelopes) {
      const deliverAfterMs = env.deliverAfter ? Date.parse(env.deliverAfter) : now;
      const key = env.dedupKey;
      if (key && this.dedupSet.has(key)) {
        continue;
      }
      if (key) this.dedupSet.add(key);
      this.queue.push({ envelope: env, attempts: 0, nextAttemptAt: deliverAfterMs });
    }
  }

  /**
   * 拉取就绪批次（不移除）
   * @param maxCount 最大批量数
   * @returns 就绪事件列表
   */
  pullReady(maxCount: number): ReadonlyArray<OutboxReadyItem> {
    const now = Date.now();
    const ready = this.queue
      .filter((e) => e.nextAttemptAt <= now)
      .sort(
        (a, b) =>
          (b.envelope.priority ?? 0) - (a.envelope.priority ?? 0) ||
          a.nextAttemptAt - b.nextAttemptAt,
      )
      .slice(0, maxCount);
    // 仅暴露 Store 端口需要的只读视图
    return ready.map((e) => ({ envelope: e.envelope, attempts: e.attempts }));
  }

  /**
   * 标记成功并移除
   * @param env 事件信封
   */
  markSucceeded(env: IntegrationEventEnvelope): void {
    const idx = this.queue.findIndex((q) => q.envelope === env);
    if (idx >= 0) this.queue.splice(idx, 1);
    const key = env.dedupKey;
    if (key) this.dedupSet.delete(key);
  }

  /**
   * 计划重试或标记失败
   * @param env 事件信封
   * @param backoffMs 退避毫秒
   * @param maxAttempts 最大尝试次数
   */
  scheduleRetry(env: IntegrationEventEnvelope, backoffMs: number, maxAttempts: number): void {
    const item = this.queue.find((q) => q.envelope === env);
    if (!item) return;
    item.attempts += 1;
    if (item.attempts >= maxAttempts) {
      // 移入失败集合并从队列移除
      this.failed.push(item);
      const idx = this.queue.findIndex((q) => q.envelope === env);
      if (idx >= 0) this.queue.splice(idx, 1);
      const key = env.dedupKey;
      if (key) this.dedupSet.delete(key);
      return;
    }
    item.nextAttemptAt = Date.now() + backoffMs;
  }

  // writer 端不暴露 start/stop，调度由 Dispatcher 控制

  /**
   * 队列指标快照
   * @returns 当前队列与失败计数
   */
  snapshot(): OutboxSnapshot {
    return { queued: this.queue.length, failed: this.failed.length };
  }
}
