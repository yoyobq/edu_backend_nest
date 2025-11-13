// src/core/common/integration-events/outbox.port.ts
import type { IntegrationEventEnvelope } from './events.types';

/**
 * 事务引用占位类型（核心层不引入具体框架类型）
 */
export interface TxRef {
  readonly kind: 'tx';
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
