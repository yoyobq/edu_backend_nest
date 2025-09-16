// src/usecases/auth/login-by-account-id.usecase.ts

import { EnrichedLoginResult, LoginWarningType } from '@app-types/auth/login-flow.types';
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { DecideLoginRoleUsecase } from './decide-login-role.usecase';
import { EnrichLoginWithIdentityUsecase } from './enrich-login-with-identity.usecase';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 根据账户 ID 登录用例（三段式编排）
 * 用于内部系统或已验证的场景（如第三方登录）
 */
@Injectable()
export class LoginByAccountIdUsecase {
  constructor(
    private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase,
    private readonly decideLoginRoleUsecase: DecideLoginRoleUsecase,
    private readonly enrichLoginWithIdentityUsecase: EnrichLoginWithIdentityUsecase,
  ) {}

  /**
   * 根据账户 ID 执行登录（三段式编排）
   * @param params 登录参数
   * @param params.accountId 账户 ID
   * @param params.ip 客户端 IP 地址
   * @param params.audience 客户端类型
   * @param params.provider 第三方登录提供商（可选，用于区分第三方登录）
   * @returns 增强的登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): Promise<EnrichedLoginResult> {
    // Execute: 执行基础登录流程
    const basicResult = await this.executeLoginFlowUsecase.execute({
      accountId,
      ip,
      audience,
      provider,
    });

    // Decide: 决策最终角色
    const { finalRole, reason } = this.decideLoginRoleUsecase.execute(
      { roleFromHint: basicResult.roleFromHint, accessGroup: basicResult.accessGroup },
      {
        accountId: basicResult.accountId,
        ip: ip || '',
        userAgent: '-',
        audience: audience || AudienceTypeEnum.DESKTOP,
      },
    );

    // Enrich: 装配身份信息
    const enrichedResult = await this.enrichLoginWithIdentityUsecase.execute({
      tokens: basicResult.tokens,
      accountId: basicResult.accountId,
      finalRole,
      accessGroup: basicResult.accessGroup,
      account: basicResult.account,
      userInfo: basicResult.userInfo,
      options: { includeIdentity: true },
    });

    // 如果角色决策使用了 fallback 策略，添加警告信息
    if (reason === 'fallback') {
      enrichedResult.warnings = [
        ...(enrichedResult.warnings ?? []),
        LoginWarningType.ROLE_FALLBACK,
      ];
    }

    return enrichedResult;
  }
}
