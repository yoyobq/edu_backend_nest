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
    // 调用 ExecuteLoginFlowUsecase 获取基础登录结果
    const basicResult = await this.executeLoginFlowUsecase.execute({
      accountId,
      ip,
      audience,
      provider,
    });

    // 将 BasicLoginResult 转换为 LoginResultModel
    const loginResult: LoginResultModel = {
      accessToken: basicResult.tokens.accessToken,
      refreshToken: basicResult.tokens.refreshToken,
      accountId: basicResult.accountId,
      role: basicResult.roleFromHint || basicResult.accessGroup[0], // 使用 roleFromHint 或 accessGroup 的第一个角色
      identity: undefined, // 简化为 undefined，由适配器层处理
    };

    return loginResult;
  }
}
