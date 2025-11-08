// src/usecases/identity-management/manager/list-managers.usecase.ts
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { ManagerEntity } from '@modules/account/identities/training/manager/account-manager.entity';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { OrderDirection } from '@src/types/common/sort.types';

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
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  /** 排序方向 */
  sortOrder?: OrderDirection;
  /** 是否包含已下线数据（默认 false） */
  includeDeleted?: boolean;
}

/**
 * Manager 分页结果
 */
export interface PaginatedManagers {
  /** 列表项 */
  items: ManagerEntity[];
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
  constructor(private readonly managerService: ManagerService) {}

  /**
   * 执行列表查询
   * @param currentAccountId 当前账户 ID
   * @param params 分页与排序参数
   * @returns Manager 分页结果
   */
  async execute(currentAccountId: number, params: ListManagersParams): Promise<PaginatedManagers> {
    // 仅允许 manager 身份执行查询
    const me = await this.managerService.findByAccountId(currentAccountId);
    if (!me) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可查看 Manager 列表');
    }

    const result = await this.managerService.findPaginated(
      {
        page: params.page ?? 1,
        limit: params.limit ?? 10,
        sortBy: params.sortBy ?? 'createdAt',
        sortOrder: params.sortOrder ?? OrderDirection.DESC,
        includeDeleted: params.includeDeleted ?? false,
      },
      undefined,
    );

    return {
      items: result.managers,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }
}
