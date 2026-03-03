// 文件位置：src/usecases/account/get-account-by-id.usecase.ts
import { Injectable } from '@nestjs/common';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';

type AccountDetail = Awaited<ReturnType<AccountQueryService['getAccountById']>>;

@Injectable()
export class GetAccountByIdUsecase {
  constructor(private readonly accountQueryService: AccountQueryService) {}

  /**
   * 获取账户详情
   * @param accountId 账户 ID
   */
  async execute(accountId: number): Promise<AccountDetail> {
    return await this.accountQueryService.getAccountById(accountId);
  }
}
