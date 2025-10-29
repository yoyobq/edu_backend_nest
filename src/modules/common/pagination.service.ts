// src/modules/common/pagination.service.ts
// 同域可复用的“读”服务封装（依赖 core 端口），承接 DI

import {
  applyDefaults,
  enforceMaxPageSize,
  whitelistSorts,
} from '@core/pagination/pagination.policy';
import type { IPaginator } from '@core/pagination/pagination.ports';
import type {
  PaginatedResult,
  PaginationParams,
  SortParam,
} from '@core/pagination/pagination.types';
import { Inject, Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { PAGINATION_TOKENS } from './tokens/pagination.tokens';

@Injectable()
export class PaginationService {
  constructor(
    @Inject(PAGINATION_TOKENS.PAGINATOR)
    private readonly paginator: IPaginator,
  ) {}

  async paginateQuery<T extends ObjectLiteral>(args: {
    readonly qb: SelectQueryBuilder<T>;
    readonly params: PaginationParams;
    readonly allowedSorts: ReadonlyArray<string>;
    readonly defaultSorts: ReadonlyArray<SortParam>;
    readonly cursorKey?: { readonly primary: string; readonly tieBreaker: string };
    readonly countDistinctBy?: string;
    readonly maxPageSize?: number;
    // ★ 必传，拒绝不安全兜底
    readonly resolveColumn: (field: string) => string | null;
  }): Promise<PaginatedResult<T>> {
    const {
      qb,
      params,
      allowedSorts,
      defaultSorts,
      cursorKey,
      countDistinctBy,
      maxPageSize = 100,
      resolveColumn,
    } = args;

    // Cursor 模式必须提供 cursorKey
    if (params.mode === 'CURSOR' && !cursorKey) {
      throw new Error('cursorKey is required in CURSOR mode');
    }

    // 应用默认规则与页大小上限
    const withDefaults = applyDefaults(params, { sorts: defaultSorts });
    const limited = enforceMaxPageSize(withDefaults, maxPageSize);
    const safeSorts = whitelistSorts(limited.sorts, allowedSorts);

    const finalParams: PaginationParams = { ...limited, sorts: safeSorts } as PaginationParams;

    return this.paginator.paginate<T>({
      qb,
      params: finalParams,
      options: {
        allowedSorts,
        defaultSorts,
        cursorKey,
        countDistinctBy,
        resolveColumn,
      },
    });
  }
}
