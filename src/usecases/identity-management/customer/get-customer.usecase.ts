// src/usecases/identity-management/customer/get-customer.usecase.ts

import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import {
  CustomerProfile,
  CustomerService,
} from '@modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { UserState } from '@app-types/models/user-info.types';
import { type CustomerLoginHistoryItem } from './list-customers.usecase';

export interface GetCustomerParams {
  currentAccountId: number;
  customerId?: number;
}

export interface GetCustomerResult {
  customer: CustomerProfile;
  userState: UserState | null;
  loginHistory: CustomerLoginHistoryItem[] | null;
  userPhone: string | null;
}

@Injectable()
export class GetCustomerUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly accountService: AccountService,
  ) {}

  async execute(params: GetCustomerParams): Promise<GetCustomerResult> {
    const { currentAccountId, customerId } = params;

    const isActive = await this.managerService.isActiveManager(currentAccountId);
    if (!isActive) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可查看客户信息');
    }

    if (!customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 必须指定目标客户 ID');
    }

    const customer = await this.customerService.findProfileById(customerId);
    if (!customer) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在');
    }

    let userState: UserState | null = null;
    let loginHistory: CustomerLoginHistoryItem[] | null = null;
    let userPhone: string | null = null;

    if (customer.accountId) {
      const ui = await this.accountService.findUserInfoByAccountId(customer.accountId);
      const acc = await this.accountService.findOneById(customer.accountId);
      userState = ui?.userState ?? null;
      userPhone = ui?.phone ?? null;
      loginHistory = acc?.recentLoginHistory ?? null;
    }

    return { customer, userState, loginHistory, userPhone };
  }
}
