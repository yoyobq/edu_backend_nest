import { DomainError, TIME_ERROR } from '@core/common/errors/domain-error';

export function formatForTimestamp3(date: Date): string {
  const validDate = ensureValidDate(date);
  if (validDate instanceof DomainError) {
    throw validDate;
  }
  return formatDateTimeUtc(validDate);
}

export function formatForDateTime(date: Date): string {
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
