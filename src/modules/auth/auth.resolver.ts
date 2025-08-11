// src/modules/auth/auth.resolver.ts

import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginResult } from '../account/dto/login-result.dto';
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
  @Mutation(() => LoginResult, { description: '用户登录' })
  async login(@Args('input') input: AuthLoginInput): Promise<LoginResult> {
    return await this.authService.login(input);
  }
}
