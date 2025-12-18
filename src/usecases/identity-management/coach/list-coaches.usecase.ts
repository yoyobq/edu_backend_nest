// src/usecases/identity-management/coach/list-coaches.usecase.ts

import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CoachEntity } from '@modules/account/identities/training/coach/account-coach.entity';
import { CoachService } from '@modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CoachSortField, type OrderDirection } from '@src/types/common/sort.types';
import { UserState } from '@app-types/models/user-info.types';

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
export interface CoachListItem {
  entity: CoachEntity;
  userState: UserState | null;
  loginHistory: { ip: string; timestamp: string; audience?: string }[] | null;
  userPhone: string | null;
}

/**
 * 列出教练列表用例（仅允许 manager 身份）
 */
@Injectable()
export class ListCoachesUsecase {
  constructor(
    private readonly coachService: CoachService,
    private readonly managerService: ManagerService,
    private readonly accountService: AccountService,
  ) {}

  /**
   * 执行列表查询
   * @param currentAccountId 当前账户 ID
   * @param params 分页与排序参数
   * @returns 教练分页结果
   */
  async execute(currentAccountId: number, params: ListCoachesParams): Promise<PaginatedCoaches> {
    // 仅允许 manager 身份执行教练列表查询
    const isActive = await this.managerService.isActiveManager(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可查看教练列表');
    }

    const result = await this.coachService.findPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      sortBy: params.sortBy ?? CoachSortField.CREATED_AT,
      sortOrder: (params.sortOrder ?? 'DESC') as 'ASC' | 'DESC',
      includeDeleted: params.includeDeleted ?? true,
      query: params.query,
    });

    const items: CoachListItem[] = await Promise.all(
      result.coaches.map(async (entity) => {
        const ui = entity.accountId
          ? await this.accountService.findUserInfoByAccountId(entity.accountId)
          : null;
        const acc = entity.accountId
          ? await this.accountService.findOneById(entity.accountId)
          : null;
        const state: UserState | null = ui?.userState ?? null;
        const history: { ip: string; timestamp: string; audience?: string }[] | null =
          acc?.recentLoginHistory ?? null;
        const phone: string | null = ui?.phone ?? null;
        return { entity, userState: state, loginHistory: history, userPhone: phone };
      }),
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
