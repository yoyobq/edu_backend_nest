// src/modules/register/register.resolver.ts

import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { RegisterService } from '@modules/register/register.service';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RegisterResult } from '@src/adapters/graphql/registration/dto/register-result.dto';
import { RegisterInput } from '@src/adapters/graphql/registration/dto/register.input';
import { Request } from 'express';

/**
 * 注册解析器
 */
@Resolver()
export class RegistrationResolver {
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
