// src/usecases/auth/login-by-account-id.usecase.ts

import { LoginResultModel } from '@app-types/models/auth.types';
import { Injectable } from '@nestjs/common';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 根据账户 ID 登录用例
 * 用于内部系统或已验证的场景
 */
@Injectable()
export class LoginByAccountIdUsecase {
  constructor(private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase) {}

  /**
   * 根据账户 ID 执行登录
   * @param params 登录参数
   * @returns 登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
  }): Promise<LoginResultModel> {
    return this.executeLoginFlowUsecase.execute({ accountId, ip, audience });
  }
}
