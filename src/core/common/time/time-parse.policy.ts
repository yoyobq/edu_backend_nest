import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { ParsedTimeInput, ParsedTimeKind } from './time.types';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;
const HAS_MILLISECONDS_PATTERN = /\.\d{1,}(?:Z|[+-]\d{2}:?\d{2})?$/i;

export function parseTimeInput(input: unknown): ParsedTimeInput | DomainError {
  if (input instanceof Date) {
    return parseFromDate(input);
  }
  if (typeof input === 'number') {
    return parseFromEpochNumber(input, input);
  }
  if (typeof input === 'string') {
    return parseFromString(input);
  }
  return invalidTimeInput(input);
}

function parseFromDate(input: Date): ParsedTimeInput | DomainError {
  if (!isValidDate(input)) {
    return invalidTimeInput(input);
  }
  return {
    raw: input,
    value: new Date(input.getTime()),
    kind: 'datetime',
    hasTimezone: false,
    hasMilliseconds: input.getMilliseconds() > 0,
  };
}

function parseFromEpochNumber(input: number, raw: unknown): ParsedTimeInput | DomainError {
  if (!Number.isFinite(input)) {
    return invalidTimeInput(raw);
  }
  const value = new Date(input);
  if (!isValidDate(value)) {
    return invalidTimeInput(raw);
  }
  return {
    raw,
    value,
    kind: 'datetime',
    hasTimezone: false,
    hasMilliseconds: value.getUTCMilliseconds() > 0,
  };
}

function parseFromString(raw: string): ParsedTimeInput | DomainError {
  const text = raw.trim();
  if (text.length === 0) {
    return invalidTimeInput(raw);
  }
  const kind: ParsedTimeKind = DATE_ONLY_PATTERN.test(text) ? 'date' : 'datetime';
  const value = new Date(text);
  if (!isValidDate(value)) {
    return invalidTimeInput(raw);
  }
  return {
    raw,
    value,
    kind,
    hasTimezone: HAS_TIMEZONE_PATTERN.test(text),
    hasMilliseconds: HAS_MILLISECONDS_PATTERN.test(text),
  };
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function invalidTimeInput(raw: unknown): DomainError {
  return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法', { raw });
}
