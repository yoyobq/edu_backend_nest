// src/modules/account/account.resolver.ts
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AccountService } from './account.service';
import { AccountDetailResponse } from './dto/account-detail.dto';
import { AccountArgs } from './dto/account.args';
// import { AccountEntity } from './entities/account.entity';

/**
 * 账户 GraphQL 解析器
 */
@Resolver()
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 根据 ID 查询单个账户详细信息
   * @param args 查询参数
   * @returns 账户详细信息
   */
  @Query(() => AccountDetailResponse, { description: '根据 ID 查询账户详细信息' })
  async account(@Args() args: AccountArgs): Promise<AccountDetailResponse> {
    return await this.accountService.findOneById(args.id);
  }
}
