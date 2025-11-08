// src/usecases/identity-management/customer/list-customers.usecase.ts

import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CustomerEntity } from '@modules/account/identities/training/customer/account-customer.entity';
import { CustomerService } from '@modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import type { OrderDirection } from '@src/types/common/sort.types';

/**
 * 列出客户列表的输入参数
 */
export interface ListCustomersParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  /** 排序方向 */
  sortOrder?: OrderDirection;
}

/**
 * 客户分页结果
 */
export interface PaginatedCustomers {
  /** 列表项 */
  items: CustomerEntity[];
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
 * 列出客户列表用例（仅允许 manager 身份）
 */
@Injectable()
export class ListCustomersUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行列表查询
   * @param currentAccountId 当前账户 ID
   * @param params 分页与排序参数
   */
  async execute(
    currentAccountId: number,
    params: ListCustomersParams,
  ): Promise<PaginatedCustomers> {
    // 仅允许 manager 身份执行客户列表查询
    const manager = await this.managerService.findByAccountId(currentAccountId);
    if (!manager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可查看客户列表');
    }

    const result = await this.customerService.findPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      sortBy: params.sortBy ?? 'createdAt',
      sortOrder: (params.sortOrder ?? 'DESC') as 'ASC' | 'DESC',
      includeDeleted: false,
    });

    return {
      items: result.customers,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }
}
