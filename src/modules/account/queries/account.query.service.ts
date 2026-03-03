import { UserAccountView } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { AccountEntity } from '../base/entities/account.entity';
import { AccountService } from '../base/services/account.service';

@Injectable()
export class AccountQueryService {
  constructor(private readonly accountService: AccountService) {}

  async getAccountById(accountId: number): Promise<UserAccountView> {
    return this.accountService.getAccountById(accountId);
  }

  toUserAccountView(account: AccountEntity): UserAccountView {
    return this.accountService.toUserAccountView(account);
  }
}
