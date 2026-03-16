// src/core/common/time/time-format.policy.ts
import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';
import {
  isBusinessDateTime,
  isSystemEventTime,
  type BusinessDateTime,
  type SystemEventTime,
} from './time.types';

export function formatForTimestamp3(date: SystemEventTime): string {
  if (!isSystemEventTime(date)) {
    throw new DomainError(
      TIME_ERROR.INVALID_SYSTEM_EVENT_TIME,
      '系统事件时间格式化输入必须来自系统事件时间收敛结果',
    );
  }
  const validDate = ensureValidDate(date);
  if (validDate instanceof DomainError) {
    throw validDate;
  }
  return formatDateTimeUtc(validDate);
}

export function formatForDateTime(date: BusinessDateTime): string {
  if (!isBusinessDateTime(date)) {
    throw new DomainError(
      TIME_ERROR.INVALID_BUSINESS_DATETIME,
      '业务日期时间格式化输入必须来自业务日期时间收敛结果',
    );
  }
  const validDate = ensureValidDate(date);
  if (validDate instanceof DomainError) {
    throw validDate;
  }
  return formatDateTimeUtc(validDate);
}

function ensureValidDate(value: Date): Date | DomainError {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return new DomainError(TIME_ERROR.INVALID_TIME_INPUT, '时间输入非法');
  }
  return value;
}

function formatDateTimeUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = pad2(value.getUTCMonth() + 1);
  const day = pad2(value.getUTCDate());
  const hours = pad2(value.getUTCHours());
  const minutes = pad2(value.getUTCMinutes());
  const seconds = pad2(value.getUTCSeconds());
  const milliseconds = pad3(value.getUTCMilliseconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad3(value: number): string {
  return value.toString().padStart(3, '0');
}
