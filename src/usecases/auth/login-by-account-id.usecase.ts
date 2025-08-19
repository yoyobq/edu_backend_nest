// src/usecases/auth/login-by-account-id.usecase.ts

import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { LoginResultModel } from '@app-types/models/auth.types';
import { Injectable } from '@nestjs/common';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 根据账户 ID 登录用例
 * 用于内部系统或已验证的场景（如第三方登录）
 */
@Injectable()
export class LoginByAccountIdUsecase {
  constructor(private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase) {}

  /**
   * 根据账户 ID 执行登录
   * @param params 登录参数
   * @param params.accountId 账户 ID
   * @param params.ip 客户端 IP 地址
   * @param params.audience 客户端类型
   * @param params.provider 第三方登录提供商（可选，用于区分第三方登录）
   * @returns 登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
    provider?: ThirdPartyProviderEnum;
  }): Promise<LoginResultModel> {
    return this.executeLoginFlowUsecase.execute({
      accountId,
      ip,
      audience,
      provider,
    });
  }
}
