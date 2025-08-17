// src/modules/register/register.service.ts

import { Injectable } from '@nestjs/common';
import { RegisterResult } from '../../adapters/graphql/registration/dto/register-result.dto';
import { RegisterInput } from '../../adapters/graphql/registration/dto/register.input';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';

/**
 * 注册服务
 * 简化为调用相应的 usecase
 */
@Injectable()
export class RegisterService {
  constructor(private readonly registerWithEmailUsecase: RegisterWithEmailUsecase) {}

  /**
   * 用户注册
   * @param input 注册参数
   * @param request 请求对象，用于获取客户端 IP
   * @returns 注册结果
   */
  async register(
    input: RegisterInput,
    request?: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      connection?: { remoteAddress?: string };
    },
  ): Promise<RegisterResult> {
    const result = await this.registerWithEmailUsecase.execute({
      loginName: input.loginName,
      loginEmail: input.loginEmail,
      loginPassword: input.loginPassword,
      nickname: input.nickname,
      request,
    });

    return {
      success: result.success,
      message: result.message,
      accountId: result.accountId,
    };
  }
}
