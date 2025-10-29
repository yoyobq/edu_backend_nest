// src/infrastructure/typeorm/pagination/typeorm-paginator.ts
// IPaginator 的 TypeORM 实现：支持 Offset 与 Cursor 模式

import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import { isCursorMode, isOffsetMode } from '@core/pagination/pagination.policy';
import type { ICursorSigner, IPaginator } from '@core/pagination/pagination.ports';
import type {
  CursorParams,
  OffsetParams,
  PaginatedResult,
  PaginationParams,
  SortDirection,
  SortParam,
} from '@core/pagination/pagination.types';
import type { SelectQueryBuilder } from 'typeorm';
import type { SortColumnMapper } from './sort-mapper';

export class TypeOrmPaginator implements IPaginator {
  constructor(
    private readonly signer: ICursorSigner,
    private readonly mapSortColumn: SortColumnMapper,
  ) {}

  async paginate<T>(input: {
    readonly qb: unknown;
    readonly params: PaginationParams;
    readonly options: {
      readonly allowedSorts: ReadonlyArray<string>;
      readonly defaultSorts: ReadonlyArray<SortParam>;
      readonly cursorKey?: { readonly primary: string; readonly tieBreaker: string };
      readonly resolveColumn: (field: string) => string | null;
    };
  }): Promise<PaginatedResult<T>> {
    const { qb, params, options } = input;
    const builder = qb as SelectQueryBuilder<Record<string, unknown>>;

    try {
      let sorts = this.resolveSorts(params.sorts, options.allowedSorts, options.defaultSorts);
      // 在游标模式下，确保稳定排序包含 tieBreaker（例如 id）
      if (isCursorMode(params) && options.cursorKey) {
        sorts = this.ensureTieBreakerSort(sorts, options.cursorKey);
      }
      this.applyOrderBy(builder, sorts, options.resolveColumn);

      if (isOffsetMode(params)) {
        return await this.paginateOffset<T>(builder, params);
      }

      if (isCursorMode(params)) {
        if (!options.cursorKey) {
          throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标分页缺少 cursorKey 定义');
        }
        return await this.paginateCursor<T>(builder, params, {
          cursorKey: options.cursorKey,
          resolveColumn: options.resolveColumn,
        });
      }

      // 默认返回空结果（不应到达）
      return { items: [] };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        PAGINATION_ERROR.DB_QUERY_FAILED,
        '分页查询失败',
        { error: error instanceof Error ? error.message : '未知错误' },
        error,
      );
    }
  }

  private async paginateOffset<T>(
    builder: SelectQueryBuilder<Record<string, unknown>>,
    params: OffsetParams,
  ): Promise<PaginatedResult<T>> {
    const skip = (params.page - 1) * params.pageSize;
    builder.skip(skip).take(params.pageSize);
    const items = (await builder.getMany()) as unknown as T[];
    const total = params.withTotal ? await builder.getCount() : undefined;
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  private async paginateCursor<T>(
    builder: SelectQueryBuilder<Record<string, unknown>>,
    params: CursorParams,
    options: {
      readonly cursorKey: { readonly primary: string; readonly tieBreaker: string };
      readonly resolveColumn: (field: string) => string | null;
    },
  ): Promise<PaginatedResult<T>> {
    const { after, limit } = params;
    if (after) {
      const token = this.signer.verify(after);
      this.applyCursorBoundary(builder, token, options.cursorKey);
    }

    const rows = (await builder.take(limit + 1).getMany()) as unknown as T[];
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext ? this.buildNextCursor(items, options.cursorKey) : undefined;

    return { items, pageInfo: { hasNext, nextCursor } };
  }

  private buildNextCursor<T>(
    rows: ReadonlyArray<T>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): string {
    // 使用当前页最后一项作为 nextCursor 的来源，避免跳过一项
    const last = rows[rows.length - 1];
    const lastRecord = last as unknown as Record<string, unknown>;
    const primaryVal = lastRecord[cursorKey.primary];
    const tieBreakerVal = lastRecord[cursorKey.tieBreaker];
    if (primaryVal == null || tieBreakerVal == null) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '无法从结果行提取游标键值');
    }

    let valueStr: string;
    if (typeof primaryVal === 'string' || typeof primaryVal === 'number') {
      valueStr = String(primaryVal);
    } else {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标主键类型不受支持');
    }

    let idStr: string;
    if (typeof tieBreakerVal === 'string' || typeof tieBreakerVal === 'number') {
      idStr = String(tieBreakerVal);
    } else {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标副键类型不受支持');
    }

    return this.signer.sign({
      key: cursorKey.primary,
      value: valueStr,
      id: idStr,
    });
  }

  private resolveSorts(
    sorts: ReadonlyArray<SortParam> | undefined,
    allowed: ReadonlyArray<string>,
    defaults: ReadonlyArray<SortParam>,
  ): ReadonlyArray<SortParam> {
    const allowedSet = new Set(allowed);
    const filtered = (sorts ?? defaults).filter((s) => allowedSet.has(s.field));
    if (!filtered.length && defaults.length) return defaults;
    return filtered;
  }

  private applyOrderBy(
    qb: SelectQueryBuilder<Record<string, unknown>>,
    sorts: ReadonlyArray<SortParam>,
    resolveColumn: (field: string) => string | null,
  ): void {
    sorts.forEach((s, idx) => {
      const column = resolveColumn(s.field) ?? this.mapSortColumn(s.field);
      if (!column) {
        throw new DomainError(PAGINATION_ERROR.SORT_FIELD_NOT_ALLOWED, `非法排序字段: ${s.field}`);
      }
      if (idx === 0) qb.orderBy(column, s.direction);
      else qb.addOrderBy(column, s.direction);
    });
  }

  private ensureTieBreakerSort(
    sorts: ReadonlyArray<SortParam>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
  ): ReadonlyArray<SortParam> {
    const hasTieBreaker = sorts.some((s) => s.field === cursorKey.tieBreaker);
    if (hasTieBreaker) return sorts;
    // 方向以 primary 的方向为准；若未显式提供，则沿用第一排序方向或 ASC
    const primaryDir: SortDirection | undefined = sorts.find(
      (s) => s.field === cursorKey.primary,
    )?.direction;
    const fallbackDir: SortDirection = (sorts[0]?.direction as SortDirection | undefined) ?? 'ASC';
    const direction: SortDirection = primaryDir ?? fallbackDir;
    return [...sorts, { field: cursorKey.tieBreaker, direction }];
  }

  private applyCursorBoundary(
    qb: SelectQueryBuilder<Record<string, unknown>>,
    token: { key: string; value: string | number; id: string | number },
    cursorKey: { primary: string; tieBreaker: string },
  ): void {
    // 典型 (primary, id) 边界： (primary > value) OR (primary = value AND id > token.id)
    const primaryColumn = this.mapSortColumn(cursorKey.primary);
    const idColumn = this.mapSortColumn(cursorKey.tieBreaker);
    if (!primaryColumn || !idColumn) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '非法游标边界列');
    }

    // 使用参数化避免注入风险
    qb.andWhere(
      `(${primaryColumn} > :cursorPrimary OR (${primaryColumn} = :cursorPrimary AND ${idColumn} > :cursorId))`,
      {
        cursorPrimary: token.value,
        cursorId: token.id,
      },
    );
  }
}
