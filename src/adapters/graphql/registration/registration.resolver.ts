// src/adapters/graphql/registration/registration.resolver.ts
import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';
import { Request } from 'express';
import { RegisterResult } from './dto/register-result.dto';
import { RegisterInput } from './dto/register.input';

// 枚举注册（side-effect）
import './enums/register-type.enum';

@Resolver()
export class RegistrationResolver {
  constructor(private readonly registerWithEmail: RegisterWithEmailUsecase) {}

  @Mutation(() => RegisterResult, { description: '用户注册' })
  @ValidateInput()
  async register(
    @Args('input') input: RegisterInput,
    @Context() context: { req: Request },
  ): Promise<RegisterResult> {
    // 只传递 usecase 关心的"扁平请求形状"，避免把 Express 类型下沉到用例层
    const req = context?.req;
    const safeRequest = req
      ? {
          headers: req.headers as Record<string, string | string[] | undefined>,
          ip: req.ip || req.socket?.remoteAddress || undefined,
          connection: { remoteAddress: req.socket?.remoteAddress },
        }
      : undefined;

    const result = await this.registerWithEmail.execute({
      loginName: input.loginName ?? null,
      loginEmail: input.loginEmail,
      loginPassword: input.loginPassword,
      nickname: input.nickname,
      request: safeRequest,
    });

    return {
      success: result.success,
      message: result.message,
      accountId: result.accountId,
    };
  }
}
