export type ParsedTimeKind = 'date' | 'datetime';

export interface ParsedTimeInput {
  readonly raw: unknown;
  readonly value: Date;
  readonly kind: ParsedTimeKind;
  readonly hasTimezone: boolean;
  readonly hasMilliseconds: boolean;
}

export interface TimeRangeOrderInput {
  readonly start?: Date;
  readonly end?: Date;
}
