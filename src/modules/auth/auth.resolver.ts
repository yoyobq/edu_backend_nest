// src/modules/auth/auth.resolver.ts

import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { AuthLoginResult } from './dto/auth-login-result';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证 GraphQL 解析器
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户登录
   * @param input 登录参数
   * @returns 登录结果
   */
  @Mutation(() => AuthLoginResult, { description: '用户登录' })
  async login(@Args('input') input: AuthLoginInput): Promise<AuthLoginResult> {
    return await this.authService.login(input);
  }
}
