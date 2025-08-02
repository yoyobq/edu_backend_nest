// src/modules/register/register.resolver.ts

import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';
import { RegisterService } from './register.service';

/**
 * 注册 GraphQL 解析器
 */
@Resolver()
export class RegisterResolver {
  constructor(private readonly registerService: RegisterService) {}

  /**
   * 用户注册
   * @param input 注册参数
   * @returns 注册结果
   */
  @Mutation(() => RegisterResult, { description: '用户注册' })
  async register(@Args('input') input: RegisterInput): Promise<RegisterResult> {
    return await this.registerService.register(input);
  }
}
