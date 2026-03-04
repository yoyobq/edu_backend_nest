// src/usecases/identity-management/manager/list-managers.usecase.ts
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import {
  ManagerQueryService,
  type ManagerListItem as ManagerListItemView,
  type ManagerUserInfoView,
} from '@modules/account/queries/manager.query.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { ManagerSortField, type OrderDirection } from '@src/types/common/sort.types';
import {
  GetVisibleUserInfoUsecase,
  type VisibleDetailMode,
} from '@src/usecases/account/get-visible-user-info.usecase';

/**
 * 列出 Manager 列表的输入参数
 * @description 仅允许 manager 身份查询
 */
export interface ListManagersParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
  /** 排序字段 */
  sortBy?: ManagerSortField;
  /** 排序方向 */
  sortOrder?: OrderDirection;
  /** 搜索关键词（姓名/手机号） */
  query?: string;
  /** 是否包含已下线数据（默认 false） */
  includeDeleted?: boolean;
}

/**
 * Manager 分页结果
 */
export type ManagerListItem = ManagerListItemView;

export interface PaginatedManagers {
  /** 列表项（包含 userinfo 补充字段） */
  items: ManagerListItem[];
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
 * 列出 Manager 列表用例（仅允许 manager 身份）
 */
@Injectable()
export class ListManagersUsecase {
  constructor(
    private readonly managerService: ManagerService,
    private readonly accountService: AccountService,
    private readonly getVisibleUserInfoUsecase: GetVisibleUserInfoUsecase,
    private readonly managerQueryService: ManagerQueryService,
  ) {}

  /**
   * 执行列表查询
   * @param currentAccountId 当前账户 ID
   * @param params 分页与排序参数
   * @returns Manager 分页结果
   */
  async execute(
    currentAccountId: number,
    params: ListManagersParams & { detailMode?: VisibleDetailMode },
  ): Promise<PaginatedManagers> {
    const isActive = await this.managerService.isActiveManager(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可查看 Manager 列表');
    }

    const rows = await this.managerService.findAllProfiles(params.includeDeleted ?? false);

    const items: ManagerListItem[] = await Promise.all(
      rows.map(async (view) => {
        const acc = view.accountId ? await this.accountService.findOneById(view.accountId) : null;
        const detail: VisibleDetailMode = params.detailMode ?? 'BASIC';
        let userInfoView: ManagerUserInfoView | null = null;
        if (view.accountId) {
          const session: UsecaseSession = { accountId: currentAccountId, roles: ['MANAGER'] };
          try {
            userInfoView = await this.getVisibleUserInfoUsecase.execute({
              session,
              targetAccountId: view.accountId,
              detail,
            });
          } catch {
            userInfoView = null;
          }
        }
        return this.managerQueryService.toListItem({
          view,
          detailMode: detail,
          loginHistory: acc?.recentLoginHistory ?? null,
          userInfoView,
        });
      }),
    );

    return {
      items,
      total: items.length,
      page: 1,
      limit: items.length,
      totalPages: 1,
    };
  }
}
