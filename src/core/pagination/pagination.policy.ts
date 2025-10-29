// src/core/pagination/pagination.policy.ts
// 分页规则与纯函数：上限、默认值、排序白名单校验等

import { CursorParams, OffsetParams, PaginationParams, SortParam } from './pagination.types';

export function enforceMaxPageSize(params: PaginationParams, max: number): PaginationParams {
  if (max <= 0) return params;
  if (isOffsetMode(params)) {
    const pageSize = Math.min(params.pageSize, max);
    return { ...params, pageSize };
  }
  if (isCursorMode(params)) {
    const limit = Math.min(params.limit, max);
    return { ...params, limit };
  }
  return params;
}

export function applyDefaults(
  params: PaginationParams,
  defaults: {
    readonly pageSize?: number;
    readonly limit?: number;
    readonly sorts?: ReadonlyArray<SortParam>;
  },
): PaginationParams {
  const defaultSorts = defaults.sorts ?? [];
  if (isOffsetMode(params)) {
    const pageSize = params.pageSize ?? defaults.pageSize ?? 20;
    const sorts = params.sorts && params.sorts.length > 0 ? params.sorts : defaultSorts;
    return { ...params, pageSize, sorts };
  }
  if (isCursorMode(params)) {
    const limit = params.limit ?? defaults.limit ?? 20;
    const sorts = params.sorts && params.sorts.length > 0 ? params.sorts : defaultSorts;
    return { ...params, limit, sorts };
  }
  return params;
}

export function whitelistSorts(
  sorts: ReadonlyArray<SortParam> | undefined,
  allowed: ReadonlyArray<string>,
): ReadonlyArray<SortParam> {
  if (!sorts || sorts.length === 0) return [] as const;
  const allowedSet = new Set(allowed);
  return sorts.filter((s) => allowedSet.has(s.field));
}

export function isCursorMode(
  params: PaginationParams,
): params is { mode: 'CURSOR' } & CursorParams {
  return params.mode === 'CURSOR';
}

export function isOffsetMode(
  params: PaginationParams,
): params is { mode: 'OFFSET' } & OffsetParams {
  return params.mode === 'OFFSET';
}
