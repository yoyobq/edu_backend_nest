// src/adapters/graphql/account/account.resolver.ts
import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { AccountArgs } from '@src/adapters/graphql/account/dto/account.args';
import { UserAccountDTO } from '@src/adapters/graphql/account/dto/user-account.dto';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { AccountService } from '@src/modules/account/base/services/account.service';

/**
 * 账户 GraphQL 解析器
 */
@Resolver()
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  /**
   * 根据 ID 查询单个账户详细信息
   * @param args 查询参数
   * @param _user 当前登录用户信息（暂未使用，但保留用于未来权限控制）
   * @returns 账户详细信息
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => UserAccountDTO, { description: '根据 ID 查询账户详细信息' })
  async account(
    @Args() args: AccountArgs,
    @currentUser() _user: JwtPayload,
  ): Promise<UserAccountDTO> {
    // 可以添加权限检查：用户只能查看自己的账户信息
    // if (args.id !== _user.sub) {
    //   throw new ForbiddenException('只能查看自己的账户信息');
    // }
    return await this.accountService.getAccountById(args.id);
  }
}
