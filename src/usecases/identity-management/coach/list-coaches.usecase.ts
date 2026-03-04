// src/usecases/identity-management/coach/list-coaches.usecase.ts

import { CoachSortField, type OrderDirection } from '@app-types/common/sort.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CoachService } from '@modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import {
  CoachQueryService,
  type CoachListItem as CoachListItemView,
} from '@modules/account/queries/coach.query.service';
import { Injectable } from '@nestjs/common';

/**
 * 列出教练列表的输入参数
 */
export interface ListCoachesParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
  /** 排序字段 */
  sortBy?: CoachSortField;
  /** 排序方向 */
  sortOrder?: OrderDirection;
  /** 搜索关键词（姓名/手机号） */
  query?: string;
  /** 是否包含已停用记录（默认包含） */
  includeDeleted?: boolean;
}

export interface ListCoachesUsecaseParams {
  currentAccountId: number;
  params: ListCoachesParams;
}

/**
 * 教练分页结果
 */
export interface PaginatedCoaches {
  /** 列表项（包含 userinfo 补充字段） */
  items: CoachListItem[];
  /** 总数 */
  total: number;
  /** 页码 */
  page: number;
  /** 每页条数 */
  limit: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 教练列表项（包含 userinfo 补充信息）
 */
export type CoachListItem = CoachListItemView;

/**
 * 列出教练列表用例（仅允许 manager 身份）
 */
@Injectable()
export class ListCoachesUsecase {
  constructor(
    private readonly coachService: CoachService,
    private readonly managerService: ManagerService,
    private readonly coachQueryService: CoachQueryService,
  ) {}

  /**
   * 执行列表查询
   * @param input 查询参数
   * @returns 教练分页结果
   */
  async execute(input: ListCoachesUsecaseParams): Promise<PaginatedCoaches> {
    const { currentAccountId, params } = input;
    // 仅允许 manager 身份执行教练列表查询
    const isActive = await this.managerService.isActiveManager(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可查看教练列表');
    }

    const result = await this.coachService.findPaginatedProfiles({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      sortBy: params.sortBy ?? CoachSortField.CREATED_AT,
      sortOrder: (params.sortOrder ?? 'DESC') as 'ASC' | 'DESC',
      includeDeleted: params.includeDeleted ?? true,
      query: params.query,
    });

    const items: CoachListItem[] = await Promise.all(
      result.coaches.map((view) => this.coachQueryService.toListItem({ view })),
    );

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }
}
