// 文件位置：src/usecases/account/get-account-by-id.usecase.ts
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';

type AccountDetail = Awaited<ReturnType<AccountService['getAccountById']>>;

@Injectable()
export class GetAccountByIdUsecase {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 获取账户详情
   * @param accountId 账户 ID
   */
  async execute(accountId: number): Promise<AccountDetail> {
    return await this.accountService.getAccountById(accountId);
  }
}
