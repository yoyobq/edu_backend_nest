// src/core/pagination/pagination.ports.ts
// 端口接口：IPaginator 与 ICursorSigner，零依赖抽象

import { CursorToken, PaginatedResult, PaginationParams, SortParam } from './pagination.types';

export interface IPaginator {
  paginate<T>(input: {
    readonly qb: unknown; // 在 core 作为黑盒；具体实现由 infrastructure 适配
    readonly params: PaginationParams;
    readonly options: {
      readonly allowedSorts: ReadonlyArray<string>;
      readonly defaultSorts: ReadonlyArray<SortParam>;
      readonly cursorKey?: { readonly primary: string; readonly tieBreaker: string };
      readonly resolveColumn: (field: string) => string | null;
    };
  }): Promise<PaginatedResult<T>>;
}

export interface ICursorSigner {
  sign(token: CursorToken): string;
  verify(cursor: string): CursorToken;
}
