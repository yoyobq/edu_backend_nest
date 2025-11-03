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
} from '@core/pagination/pagination.types';
import type { SelectQueryBuilder } from 'typeorm';

export class TypeOrmPaginator implements IPaginator {
  constructor(private readonly signer: ICursorSigner) {}

  async paginate<T>(input: {
    readonly qb: unknown;
    readonly params: PaginationParams;
    readonly options: {
      readonly countDistinctBy?: string;
      readonly cursor?: {
        readonly key: { readonly primary: string; readonly tieBreaker: string };
        readonly columns: { readonly primary: string; readonly tieBreaker: string };
        readonly directions: {
          readonly primaryDir: SortDirection;
          readonly tieBreakerDir: SortDirection;
        };
        readonly accessors?: {
          readonly primary: (row: unknown) => string | number | null | undefined;
          readonly tieBreaker: (row: unknown) => string | number | null | undefined;
        };
      };
    };
  }): Promise<PaginatedResult<T>> {
    const { qb, params, options } = input;
    const builder = qb as SelectQueryBuilder<Record<string, unknown>>;

    try {
      if (isOffsetMode(params)) {
        return await this.paginateOffset<T>(builder, params, options.countDistinctBy);
      }

      if (isCursorMode(params)) {
        if (!options.cursor) {
          throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标分页缺少 cursorKey 定义');
        }
        return await this.paginateCursor<T>(builder, params, options.cursor);
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
    countDistinctBy?: string,
  ): Promise<PaginatedResult<T>> {
    const skip = (params.page - 1) * params.pageSize;
    const pageQb = builder.clone().skip(skip).take(params.pageSize);
    const items = (await pageQb.getMany()) as unknown as T[];
    let total: number | undefined;
    if (params.withTotal) {
      const countQb = builder.clone();
      // 清理排序以提升 COUNT 性能，避免 ORDER BY 对 COUNT 的影响
      countQb.orderBy();
      if (countDistinctBy) {
        // 当存在 join 或多行同实体时，通过 COUNT(DISTINCT ...) 保证总数准确
        const col = countQb.connection.driver.escape(countDistinctBy);
        const alias = 'distinct_cnt';
        const raw = await countQb
          .select(`COUNT(DISTINCT ${col})`, alias)
          .getRawOne<Record<string, unknown>>();
        const val = raw?.[alias];
        total = typeof val === 'number' ? val : Number(val ?? 0);
      } else {
        total = await countQb.getCount();
      }
    }
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  private async paginateCursor<T>(
    builder: SelectQueryBuilder<Record<string, unknown>>,
    params: CursorParams,
    cursor: {
      readonly key: { readonly primary: string; readonly tieBreaker: string };
      readonly columns: { readonly primary: string; readonly tieBreaker: string };
      readonly directions: {
        readonly primaryDir: SortDirection;
        readonly tieBreakerDir: SortDirection;
      };
      readonly accessors?: {
        readonly primary: (row: unknown) => string | number | null | undefined;
        readonly tieBreaker: (row: unknown) => string | number | null | undefined;
      };
    },
  ): Promise<PaginatedResult<T>> {
    const { after, limit } = params;
    if (after) {
      const token = this.signer.verify(after);
      // 强一致校验：防止跨端点/跨列表复用游标导致边界错乱
      if (token.key !== cursor.key.primary) {
        throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '游标主键不匹配');
      }
      this.applyCursorBoundary(builder, token, cursor.columns, cursor.directions);
    }

    const rows = (await builder.take(limit + 1).getMany()) as unknown as T[];
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext
      ? this.buildNextCursor(items, cursor.key, cursor.accessors)
      : undefined;

    return { items, pageInfo: { hasNext, nextCursor } };
  }

  /**
   * 构建下一页游标
   * 优先使用调用方提供的 `accessors` 从结果行提取游标键值，以兼容 raw/别名查询；
   * 回退采用实体属性访问（适用于 `getMany` 返回实体）。
   */
  private buildNextCursor<T>(
    rows: ReadonlyArray<T>,
    cursorKey: { readonly primary: string; readonly tieBreaker: string },
    accessors?: {
      readonly primary: (row: unknown) => string | number | null | undefined;
      readonly tieBreaker: (row: unknown) => string | number | null | undefined;
    },
  ): string {
    // 使用当前页最后一项作为 nextCursor 的来源，避免跳过一项
    const last = rows[rows.length - 1] as unknown;
    const record = last as Record<string, unknown>;
    const primaryVal = accessors?.primary?.(last) ?? record[cursorKey.primary];
    const tieBreakerVal = accessors?.tieBreaker?.(last) ?? record[cursorKey.tieBreaker];
    if (primaryVal == null || tieBreakerVal == null) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '无法从结果行提取游标键值');
    }
    // 额外健壮性校验：签名 token 中的 key 必须为 cursorKey.primary；
    // 当字段类型为 Date 时，建议查询层返回 string（ISO）或数值时间戳，避免驱动差异导致比较不一致。

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

  private applyCursorBoundary(
    qb: SelectQueryBuilder<Record<string, unknown>>,
    token: { key: string; value: string | number; id: string | number },
    columns: { readonly primary: string; readonly tieBreaker: string },
    directions: { readonly primaryDir: SortDirection; readonly tieBreakerDir: SortDirection },
  ): void {
    // 典型 (primary, id) 边界： (primary > value) OR (primary = value AND id > token.id)
    const primaryColumn = columns.primary;
    const idColumn = columns.tieBreaker;
    if (!primaryColumn || !idColumn) {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '非法游标边界列');
    }

    // 根据排序方向选择比较操作符
    const primaryOp = directions.primaryDir === 'DESC' ? '<' : '>';
    const tieBreakerOp = directions.tieBreakerDir === 'DESC' ? '<' : '>';

    // 使用参数化避免注入风险
    qb.andWhere(
      `(${primaryColumn} ${primaryOp} :cursorPrimary OR (${primaryColumn} = :cursorPrimary AND ${idColumn} ${tieBreakerOp} :cursorId))`,
      {
        cursorPrimary: token.value,
        cursorId: token.id,
      },
    );
  }
}
