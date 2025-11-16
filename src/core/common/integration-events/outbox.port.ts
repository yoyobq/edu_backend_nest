// src/core/common/integration-events/outbox.port.ts
// src/core/common/integration-events/outbox.port.ts
import type { IntegrationEventEnvelope } from './events.types';

/**
 * 事务引用占位类型（核心层不引入具体框架类型）
 */
export interface TxRef {
  readonly kind: 'tx';
  readonly opaque?: unknown;
}

/**
 * Outbox 端口接口（纯抽象，无 I/O）
 */
export interface IOutboxWriterPort {
  enqueue(input: {
    readonly tx?: TxRef;
    readonly envelope: IntegrationEventEnvelope;
  }): Promise<void>;
  enqueueMany(input: {
    readonly tx?: TxRef;
    readonly envelopes: ReadonlyArray<IntegrationEventEnvelope>;
  }): Promise<void>;
}

export interface IOutboxDispatcherPort {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Outbox Store 端口（供 Dispatcher 使用）
 * - 负责提供就绪事件拉取与状态更新能力
 * - 不关心具体存储实现（内存 / DB / MQ），保持纯抽象
 */
export interface IOutboxStorePort {
  /**
   * 拉取就绪事件批次（不移除）
   * @param maxCount 最大批量数
   * @returns 就绪事件只读列表
   */
  pullReady(maxCount: number): ReadonlyArray<OutboxReadyItem>;

  /**
   * 标记事件成功并移除出队列/存储
   * @param env 事件信封
   */
  markSucceeded(env: IntegrationEventEnvelope): void;

  /**
   * 计划重试或标记失败
   * @param env 事件信封
   * @param backoffMs 退避毫秒数
   * @param maxAttempts 最大尝试次数
   */
  scheduleRetry(env: IntegrationEventEnvelope, backoffMs: number, maxAttempts: number): void;

  /**
   * 队列指标快照（可选）
   * @returns 当前队列与失败计数
   */
  snapshot?(): OutboxSnapshot;
}

/**
 * 就绪事件项（供 Dispatcher 使用）
 */
export interface OutboxReadyItem {
  readonly envelope: IntegrationEventEnvelope;
  readonly attempts: number;
}

/**
 * 队列快照指标
 */
export interface OutboxSnapshot {
  readonly queued: number;
  readonly failed: number;
}
