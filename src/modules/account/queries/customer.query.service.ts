import { UserState } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { AccountService } from '../base/services/account.service';
import { CustomerProfile } from '../identities/training/customer/account-customer.service';

export type CustomerView = CustomerProfile;

export type CustomerLoginHistoryItem = {
  ip: string;
  timestamp: string;
  audience?: string;
};

export type CustomerListItem = {
  customer: CustomerView;
  userState: UserState | null;
  loginHistory: CustomerLoginHistoryItem[] | null;
  userPhone: string | null;
};

@Injectable()
export class CustomerQueryService {
  constructor(private readonly accountService: AccountService) {}

  async toListItem(params: { customer: CustomerView }): Promise<CustomerListItem> {
    const accountId = params.customer.accountId;
    if (!accountId) {
      return {
        customer: params.customer,
        userState: null,
        loginHistory: null,
        userPhone: null,
      };
    }

    const [userInfo, account] = await Promise.all([
      this.accountService.findUserInfoByAccountId(accountId),
      this.accountService.findOneById(accountId),
    ]);

    return {
      customer: params.customer,
      userState: userInfo?.userState ?? null,
      loginHistory: account?.recentLoginHistory ?? null,
      userPhone: userInfo?.phone ?? null,
    };
  }
}
