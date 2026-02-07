// src/usecases/identity-management/customer/list-overdue-customers.usecase.ts

import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import {
  CustomerProfile,
  CustomerService,
} from '@modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { UserState } from '@app-types/models/user-info.types';

/**
 * 欠费客户列表的输入参数
 */
export interface ListOverdueCustomersParams {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，默认 10，最大 100 */
  limit?: number;
}

/**
 * 欠费客户分页结果
 */
export interface OverdueCustomerLoginHistoryItem {
  ip: string;
  timestamp: string;
  audience?: string;
}

export interface OverdueCustomerListItem {
  customer: CustomerProfile;
  userState: UserState | null;
  loginHistory: OverdueCustomerLoginHistoryItem[] | null;
  userPhone: string | null;
}

export interface PaginatedOverdueCustomers {
  /** 列表项 */
  items: OverdueCustomerListItem[];
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
 * 列出欠费客户列表用例（仅允许 manager 身份）
 */
@Injectable()
export class ListOverdueCustomersUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly accountService: AccountService,
  ) {}

  /**
   * 执行欠费列表查询
   * @param currentAccountId 当前账户 ID
   * @param params 分页参数
   */
  async execute(
    currentAccountId: number,
    params: ListOverdueCustomersParams,
  ): Promise<PaginatedOverdueCustomers> {
    const isActive = await this.managerService.isActiveManager(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可查看欠费客户列表');
    }

    const result = await this.customerService.findOverduePaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      includeDeleted: false,
    });

    const items: OverdueCustomerListItem[] = await Promise.all(
      result.customers.map(async (customer) => {
        const ui = customer.accountId
          ? await this.accountService.findUserInfoByAccountId(customer.accountId)
          : null;
        const acc = customer.accountId
          ? await this.accountService.findOneById(customer.accountId)
          : null;
        const state: UserState | null = ui?.userState ?? null;
        const history: OverdueCustomerLoginHistoryItem[] | null = acc?.recentLoginHistory ?? null;
        return { customer, userState: state, loginHistory: history, userPhone: ui?.phone ?? null };
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
