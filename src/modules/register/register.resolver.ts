// src/modules/register/register.resolver.ts

import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';
import { RegisterService } from './register.service';

/**
 * 注册解析器
 */
@Resolver()
export class RegisterResolver {
  constructor(private readonly registerService: RegisterService) {}

  /**
   * 用户注册
   * @param input 注册参数
   * @param context GraphQL 上下文，包含 request 对象
   * @returns 注册结果
   */
  @Mutation(() => RegisterResult, { description: '用户注册' })
  @ValidateInput()
  async register(
    @Args('input') input: RegisterInput,
    @Context() context: { req: Request },
  ): Promise<RegisterResult> {
    return await this.registerService.register(input, context.req);
  }
}
