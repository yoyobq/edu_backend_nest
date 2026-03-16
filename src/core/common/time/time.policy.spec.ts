import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import { formatForDateTime, formatForTimestamp3 } from './time-format.policy';
import { validateTimeRangeOrder } from './time-guard.policy';
import { normalizeBusinessDateTime, normalizeSystemEventTime } from './time-normalize.policy';
import { parseTimeInput } from './time-parse.policy';

describe('time policies', () => {
  it('parses datetime string with timezone', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00.123Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    expect(parsed.kind).toBe('datetime');
    expect(parsed.hasTimezone).toBe(true);
    expect(parsed.hasMilliseconds).toBe(true);
    expect(parsed.value.toISOString()).toBe('2026-03-16T10:00:00.123Z');
  });

  it('parses date-only string', () => {
    const parsed = parseTimeInput('2026-03-16');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    expect(parsed.kind).toBe('date');
    expect(parsed.hasTimezone).toBe(false);
  });

  it('returns error for unsupported raw input', () => {
    const parsed = parseTimeInput({ foo: 'bar' });
    expect(parsed).toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      expect(parsed.code).toBe(TIME_ERROR.INVALID_TIME_INPUT);
    }
  });

  it('normalizes explicit system event datetime', () => {
    const parsed = parseTimeInput('2026-03-16T10:00:00Z');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeSystemEventTime(parsed);
    expect(normalized).toBeInstanceOf(Date);
    if (normalized instanceof Date) {
      expect(normalized.toISOString()).toBe('2026-03-16T10:00:00.000Z');
    }
  });

  it('rejects date-only value for business datetime normalize', () => {
    const parsed = parseTimeInput('2026-03-16');
    expect(parsed).not.toBeInstanceOf(DomainError);
    if (parsed instanceof DomainError) {
      return;
    }
    const normalized = normalizeBusinessDateTime(parsed);
    expect(normalized).toBeInstanceOf(DomainError);
    if (normalized instanceof DomainError) {
      expect(normalized.code).toBe(TIME_ERROR.INVALID_BUSINESS_DATETIME);
    }
  });

  it('formats timestamp3 output stably', () => {
    const value = new Date('2026-03-16T10:00:00.123Z');
    expect(formatForTimestamp3(value)).toBe('2026-03-16 10:00:00.123');
  });

  it('formats datetime output stably', () => {
    const value = new Date('2026-03-16T10:00:00.004Z');
    expect(formatForDateTime(value)).toBe('2026-03-16 10:00:00.004');
  });

  it('validates time range order only', () => {
    const noError = validateTimeRangeOrder({
      start: new Date('2026-03-16T10:00:00Z'),
      end: new Date('2026-03-16T11:00:00Z'),
    });
    expect(noError).toBeUndefined();

    const err = validateTimeRangeOrder({
      start: new Date('2026-03-16T12:00:00Z'),
      end: new Date('2026-03-16T11:00:00Z'),
    });
    expect(err).toBeInstanceOf(DomainError);
    if (err instanceof DomainError) {
      expect(err.code).toBe(TIME_ERROR.INVALID_TIME_RANGE_ORDER);
    }
  });
});
