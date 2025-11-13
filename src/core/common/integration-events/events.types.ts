// src/core/common/integration-events/events.types.ts
/**
 * 事件类型枚举（采用过去式命名）
 */
export type IntegrationEventType =
  | 'EnrollmentCreated'
  | 'EnrollmentCancelled'
  | 'SessionClosed'
  | 'PayoutGenerated'
  | 'PricingApproved'
  | 'WaitlistPromoted';

export type ISO8601String = string & { readonly brand: 'ISO8601' };
export type DedupKey = string & { readonly brand: 'DedupKey' };

/**
 * 集成事件信封类型（用于 Outbox 投递）
 */
export interface IntegrationEventEnvelope<T extends IntegrationEventType = IntegrationEventType> {
  readonly type: T;
  readonly aggregateType: string;
  readonly aggregateId: number | string;
  readonly tenantId?: number | string | null;
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly dedupKey?: DedupKey;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt: ISO8601String;
  readonly deliverAfter?: ISO8601String;
  readonly priority?: number;
}

/**
 * 构造标准事件信封（纯函数）
 * @param input 输入参数对象
 */
export function buildEnvelope(input: {
  readonly type: IntegrationEventType;
  readonly aggregateType: string;
  readonly aggregateId: number | string;
  readonly schemaVersion?: number;
  readonly payload?: Readonly<Record<string, JsonValue>>;
  readonly dedupKey?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt?: Date;
  readonly deliverAfter?: Date;
  readonly priority?: number;
}): IntegrationEventEnvelope {
  const occurredAt = (input.occurredAt ?? new Date()).toISOString() as ISO8601String;
  const deliverAfter = input.deliverAfter
    ? (input.deliverAfter.toISOString() as ISO8601String)
    : undefined;
  const schemaVersion = input.schemaVersion ?? 1;
  const payload = input.payload ?? {};
  const dedupKey = (input.dedupKey ??
    `${input.type}:${input.aggregateId}:${schemaVersion}`) as DedupKey;
  return {
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    schemaVersion,
    payload,
    dedupKey,
    correlationId: input.correlationId,
    causationId: input.causationId,
    occurredAt,
    deliverAfter,
    priority: input.priority,
  };
}

/**
 * 极简工厂：统一默认值与品牌化（纯函数、无 I/O）
 * @param input 输入参数对象
 */
export function makeEnvelope<T extends IntegrationEventType>(
  input: Omit<IntegrationEventEnvelope<T>, 'occurredAt' | 'schemaVersion'> & {
    readonly occurredAt?: ISO8601String;
    readonly schemaVersion?: number;
  },
): IntegrationEventEnvelope<T> {
  return Object.freeze({
    schemaVersion: input.schemaVersion ?? 1,
    occurredAt: (input.occurredAt ?? new Date().toISOString()) as ISO8601String,
    ...input,
  });
}
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [k: string]: JsonValue }
  | ReadonlyArray<JsonValue>;
