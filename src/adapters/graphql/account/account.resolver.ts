// src/modules/account/account.resolver.ts
import { AccountService } from '@modules/account/account.service';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AccountArgs } from '@src/adapters/graphql/account/dto/account.args';
import { UserAccountDTO } from '@src/adapters/graphql/account/dto/user-account.dto';

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
  @Query(() => UserAccountDTO, { description: '根据 ID 查询账户详细信息' })
  async account(@Args() args: AccountArgs): Promise<UserAccountDTO> {
    return await this.accountService.findOneById(args.id);
  }
}
