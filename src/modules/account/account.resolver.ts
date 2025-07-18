// src/modules/account/account.resolver.ts

import { Resolver } from '@nestjs/graphql';
import { AccountService } from './account.service';

/**
 * 账户 GraphQL 解析器
 */
@Resolver()
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  // 这里将来可以添加账户相关的查询和变更操作
  // 例如：获取账户信息、更新账户信息等
}
