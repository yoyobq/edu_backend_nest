// src/adapters/graphql/auth/auth.resolver.ts

import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { LoginResult } from '@src/adapters/graphql/account/dto/login-result.dto';
import { AuthLoginInput } from '@src/adapters/graphql/auth/dto/auth-login.input';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';

/**
 * 认证 GraphQL 解析器
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase) {}

  /**
   * 用户登录
   * @param input 登录参数
   * @returns 登录结果
   */
  @Mutation(() => LoginResult, { description: '用户登录' })
  async login(@Args('input') input: AuthLoginInput): Promise<LoginResult> {
    return await this.loginWithPasswordUsecase.execute(input);
  }
}
