/* eslint-disable max-lines-per-function */
// src/core/common/integration-events/events.types.spec.ts
import { buildEnvelope, makeEnvelope, type DedupKey, type ISO8601String } from './events.types';

/**
 * 构造标准事件信封的单元测试
 */
describe('buildEnvelope', () => {
  it('默认填充 schemaVersion=1、occurredAt、dedupKey', () => {
    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 123,
    });
    expect(env.type).toBe('EnrollmentCreated');
    expect(env.aggregateType).toBe('enrollment');
    expect(env.aggregateId).toBe(123);
    expect(env.schemaVersion).toBe(1);
    expect(typeof env.occurredAt).toBe('string');
    expect(String(env.dedupKey)).toBe('EnrollmentCreated:123:1');
  });

  it('支持覆盖 schemaVersion、payload、correlationId 与 deliverAfter', () => {
    const deliverAfter = new Date(Date.now() + 1000);
    const env = buildEnvelope({
      type: 'EnrollmentCancelled',
      aggregateType: 'enrollment',
      aggregateId: 'abc',
      schemaVersion: 2,
      payload: { reason: 'user_cancel' },
      correlationId: 'corr-1',
      deliverAfter,
      priority: 5,
    });
    expect(env.schemaVersion).toBe(2);
    expect(env.payload).toEqual({ reason: 'user_cancel' });
    expect(env.correlationId).toBe('corr-1');
    expect(String(env.deliverAfter)).toBe(deliverAfter.toISOString());
    expect(env.priority).toBe(5);
    expect(String(env.dedupKey)).toBe('EnrollmentCancelled:abc:2');
  });

  it('允许定制 dedupKey', () => {
    const env = buildEnvelope({
      type: 'SessionClosed',
      aggregateType: 'session',
      aggregateId: 99,
      schemaVersion: 3,
      dedupKey: 'custom-key',
    });
    expect(String(env.dedupKey)).toBe('custom-key');
  });

  it('makeEnvelope 提供 occurredAt/schemaVersion 默认值与品牌化', () => {
    const env = makeEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 1,
      payload: { ok: true },
    });
    expect(env.schemaVersion).toBe(1);
    expect(typeof env.occurredAt).toBe('string');
    // occurredAt/dedupKey 为品牌类型，断言字符串等值
    const env2 = makeEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 1,
      payload: { ok: true },
      schemaVersion: 2,
      occurredAt: new Date('2020-01-01T00:00:00.000Z').toISOString() as ISO8601String,
    });
    expect(env2.schemaVersion).toBe(2);
    expect(String(env2.occurredAt)).toBe('2020-01-01T00:00:00.000Z');
  });

  it('buildEnvelope 未提供 dedupKey 时自动生成', () => {
    const env = buildEnvelope({
      type: 'WaitlistPromoted',
      aggregateType: 'waitlist',
      aggregateId: 'L-77',
    });
    expect(String(env.dedupKey)).toBe('WaitlistPromoted:L-77:1');
  });

  it('schemaVersion 影响 dedupKey 默认值', () => {
    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 456,
      schemaVersion: 7,
    });
    expect(String(env.dedupKey)).toBe('EnrollmentCreated:456:7');
  });

  it('允许传入 occurredAt 为 Date 并正确序列化', () => {
    const occurred = new Date('2023-05-06T12:34:56.000Z');
    const env = buildEnvelope({
      type: 'SessionClosed',
      aggregateType: 'session',
      aggregateId: 321,
      occurredAt: occurred,
    });
    expect(String(env.occurredAt)).toBe(occurred.toISOString());
  });

  it('priority 未设置时为 undefined', () => {
    const env = buildEnvelope({
      type: 'PayoutGenerated',
      aggregateType: 'payout',
      aggregateId: 'p-1',
    });
    expect(env.priority).toBeUndefined();
  });
});

describe('makeEnvelope', () => {
  it('未提供 dedupKey 时不自动生成', () => {
    const env = makeEnvelope({
      type: 'EnrollmentCancelled',
      aggregateType: 'enrollment',
      aggregateId: 100,
      payload: {},
    });
    expect(env.dedupKey).toBeUndefined();
  });

  it('顶层对象被冻结，禁止后续修改', () => {
    const env = makeEnvelope({
      type: 'WaitlistPromoted',
      aggregateType: 'waitlist',
      aggregateId: 'w-9',
      payload: { ok: true },
    });
    expect(Object.isFrozen(env)).toBe(true);
    expect(() => {
      (env as unknown as { schemaVersion: number }).schemaVersion = 999;
    }).toThrow();
  });

  it('payload 支持嵌套 JSON 值结构', () => {
    const env = makeEnvelope({
      type: 'PricingApproved',
      aggregateType: 'pricing',
      aggregateId: 'pa-7',
      payload: {
        a: 1,
        b: 'x',
        c: true,
        d: null,
        e: { k: ['v1', 2, false, null] },
      },
    });
    expect(env.payload).toEqual({
      a: 1,
      b: 'x',
      c: true,
      d: null,
      e: { k: ['v1', 2, false, null] },
    });
  });

  it('deliverAfter 品牌类型字符串被保留', () => {
    const delay = new Date('2022-01-02T03:04:05.000Z').toISOString() as ISO8601String;
    const env = makeEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 2,
      payload: {},
      deliverAfter: delay,
    });
    expect(String(env.deliverAfter)).toBe('2022-01-02T03:04:05.000Z');
  });
});

/**
 * 类型误用保护：品牌类型不接受普通 string（编译期断言）
 */
// @ts-expect-error should not accept plain string
const badTime: ISO8601String = '2020-01-01';
void badTime;
// @ts-expect-error should not accept plain string
const badKey: DedupKey = 'dedup-1';
void badKey;

describe('约束与规划', () => {
  it.skip('deliverAfter 不得早于 occurredAt（未来可选运行时校验）', () => {
    const occurred = new Date('2024-01-01T00:00:00.000Z');
    const deliverAfter = new Date('2023-12-31T23:59:59.000Z');
    const env = buildEnvelope({
      type: 'SessionClosed',
      aggregateType: 'session',
      aggregateId: 1,
      occurredAt: occurred,
      deliverAfter,
    });
    expect(String(env.occurredAt)).toBe(occurred.toISOString());
    expect(String(env.deliverAfter)).toBe(deliverAfter.toISOString());
    // TODO: 未来若加入校验，应在此断言抛错或记录警告
  });

  it.skip('aggregateId 统一规范为 string（若未来收敛时开启）', () => {
    const env = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'enrollment',
      aggregateId: 123,
    });
    // 规划：统一规范为 String(123)
    expect(String(env.aggregateId)).toBe('123');
  });
});
