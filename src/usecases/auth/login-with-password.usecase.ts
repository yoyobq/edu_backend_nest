// src/usecases/auth/login-with-password.usecase.ts

import { EnrichedLoginResult, LoginWarningType } from '@app-types/auth/login-flow.types';
import { AuthLoginModel } from '@app-types/models/auth.types';
import { AccountStatus } from '@app-types/models/account.types';
import { AUTH_ERROR, DomainError, isDomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { PinoLogger } from 'nestjs-pino';
import { DecideLoginRoleUsecase } from './decide-login-role.usecase';
import { EnrichLoginWithIdentityUsecase } from './enrich-login-with-identity.usecase';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 密码登录用例
 * 负责编排密码登录的完整流程（Validate → Execute → Decide → Enrich）
 */
@Injectable()
export class LoginWithPasswordUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase,
    private readonly decideLoginRoleUsecase: DecideLoginRoleUsecase,
    private readonly enrichLoginWithIdentityUsecase: EnrichLoginWithIdentityUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginWithPasswordUsecase.name);
  }

  /**
   * 执行密码登录（四段式编排）
   * @param params 登录参数
   * @returns 增强的登录结果
   */
  async execute({
    loginName,
    loginPassword,
    ip,
    audience,
  }: AuthLoginModel): Promise<EnrichedLoginResult> {
    try {
      // Validate: 验证登录凭据
      const account = await this.validateLoginCredentials({ loginName, loginPassword });

      // Execute: 执行基础登录流程
      const basicResult = await this.executeLoginFlowUsecase.execute({
        accountId: account.id,
        ip,
        audience,
      });

      // Decide: 决策最终角色
      const { finalRole, reason } = this.decideLoginRoleUsecase.execute(
        { roleFromHint: basicResult.roleFromHint, accessGroup: basicResult.accessGroup },
        {
          accountId: basicResult.accountId,
          ip: ip || '',
          userAgent: '',
          audience: audience,
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
    } catch (error) {
      // 记录登录失败
      this.logger.error(
        { loginName, ip, audience, error: isDomainError(error) ? error.code : 'UNKNOWN_ERROR' },
        '密码登录失败',
      );

      // 直接重新抛出错误，让上层适配器处理
      throw error;
    }
  }

  /**
   * 验证登录凭据
   * @param params 登录参数
   * @returns 验证通过的账户信息
   */
  private async validateLoginCredentials({
    loginName,
    loginPassword,
  }: Pick<AuthLoginModel, 'loginName' | 'loginPassword'>) {
    // 查找账户（支持登录名或邮箱）
    const account = await this.accountService.findByLoginName(loginName);
    if (!account) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 检查账户状态
    if (account.status !== AccountStatus.ACTIVE) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '账户未激活或已被禁用');
    }

    // 验证密码
    const isPasswordValid = AccountService.verifyPassword(
      loginPassword,
      account.loginPassword,
      account.createdAt,
    );

    if (!isPasswordValid) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码错误');
    }

    return account;
  }
}
