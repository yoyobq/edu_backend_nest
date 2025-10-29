// src/core/pagination/pagination.types.ts
// 纯类型与值对象，零依赖、零副作用

export type PaginationMode = 'OFFSET' | 'CURSOR';

export type SortDirection = 'ASC' | 'DESC';

export interface SortParam {
  readonly field: string;
  readonly direction: SortDirection;
}

export interface OffsetParams {
  readonly page: number;
  readonly pageSize: number;
  readonly sorts?: ReadonlyArray<SortParam>;
  readonly withTotal?: boolean;
}

export interface CursorParams {
  readonly after?: string;
  readonly limit: number;
  readonly sorts?: ReadonlyArray<SortParam>;
}

export type PaginationParams =
  | ({ readonly mode: 'OFFSET' } & OffsetParams)
  | ({ readonly mode: 'CURSOR' } & CursorParams);

export interface PageInfo {
  readonly hasNext: boolean;
  readonly nextCursor?: string;
}

export interface PaginatedResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly total?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly pageInfo?: PageInfo;
}

// 游标值对象，用于签名/校验
export interface CursorToken {
  readonly key: string;
  readonly value: string | number;
  readonly id: string | number;
}
