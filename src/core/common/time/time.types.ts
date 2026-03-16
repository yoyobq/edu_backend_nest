// src/core/common/time/time.types.ts
export type ParsedTimeKind = 'date' | 'datetime';
export type ParsedTimeSource = 'string' | 'date_object' | 'epoch_ms';

export interface ParsedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface ParsedDateTimeParts extends ParsedDateParts {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

interface ParsedTimeInputBase {
  readonly raw: unknown;
  readonly source: ParsedTimeSource;
  readonly hasTimezone: boolean;
  readonly timezoneOffsetMinutes: number | null;
  readonly hasMilliseconds: boolean;
}

export interface ParsedDateInput extends ParsedTimeInputBase {
  readonly kind: 'date';
  readonly parts: ParsedDateParts;
  readonly instant: null;
  readonly hasTimezone: false;
  readonly timezoneOffsetMinutes: null;
  readonly hasMilliseconds: false;
}

export interface ParsedDateTimeInput extends ParsedTimeInputBase {
  readonly kind: 'datetime';
  readonly parts: ParsedDateTimeParts;
  readonly instant: Date | null;
}

export type ParsedTimeInput = ParsedDateInput | ParsedDateTimeInput;

export type SystemEventTime = Date & { readonly timeSemantic: 'system_event_time' };
export type BusinessDateTime = Date & { readonly timeSemantic: 'business_datetime' };
const SYSTEM_EVENT_TIME_SYMBOL = Symbol('system_event_time');
const BUSINESS_DATETIME_SYMBOL = Symbol('business_datetime');

type MarkedDate = Date & {
  [SYSTEM_EVENT_TIME_SYMBOL]?: true;
  [BUSINESS_DATETIME_SYMBOL]?: true;
};

export function markSystemEventTime(value: Date): SystemEventTime {
  const marked = value as MarkedDate;
  marked[SYSTEM_EVENT_TIME_SYMBOL] = true;
  return marked as SystemEventTime;
}

export function markBusinessDateTime(value: Date): BusinessDateTime {
  const marked = value as MarkedDate;
  marked[BUSINESS_DATETIME_SYMBOL] = true;
  return marked as BusinessDateTime;
}

export function isSystemEventTime(value: Date): value is SystemEventTime {
  const marked = value as MarkedDate;
  return marked[SYSTEM_EVENT_TIME_SYMBOL] === true;
}

export function isBusinessDateTime(value: Date): value is BusinessDateTime {
  const marked = value as MarkedDate;
  return marked[BUSINESS_DATETIME_SYMBOL] === true;
}

export interface TimeRangeOrderInput {
  readonly start?: Date;
  readonly end?: Date;
}
