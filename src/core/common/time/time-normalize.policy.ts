import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import type { ParsedTimeInput } from './time.types';

export function normalizeSystemEventTime(input: ParsedTimeInput): Date | DomainError {
  if (input.kind !== 'datetime') {
    return new DomainError(TIME_ERROR.INVALID_SYSTEM_EVENT_TIME, '系统事件时间必须为 datetime');
  }
  return new Date(input.value.getTime());
}

export function normalizeBusinessDateTime(input: ParsedTimeInput): Date | DomainError {
  if (input.kind !== 'datetime') {
    return new DomainError(TIME_ERROR.INVALID_BUSINESS_DATETIME, '业务日期时间必须为 datetime');
  }
  return new Date(input.value.getTime());
}
