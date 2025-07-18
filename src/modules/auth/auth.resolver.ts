// src/modules/auth/auth.resolver.ts

import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { AuthLoginResult } from './dto/auth-login-result.dto';
import { AuthLoginArgs } from './dto/auth.args';

/**
 * 认证 GraphQL 解析器
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户登录
   * @param loginArgs 登录参数
   * @returns 登录结果
   */
  @Mutation(() => AuthLoginResult, { description: '用户登录' })
  async login(@Args() loginArgs: AuthLoginArgs): Promise<AuthLoginResult> {
    return await this.authService.login(loginArgs);
  }
}
