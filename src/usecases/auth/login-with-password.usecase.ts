// src/usecases/auth/login-with-password.usecase.ts

import { EnrichedLoginResult } from '@app-types/auth/login-flow.types';
import { AuthLoginModel } from '@app-types/models/auth.types';
import { isDomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { ValidateLoginUsecase } from '@usecases/account/validate-login.usecase';
import { PinoLogger } from 'nestjs-pino';
import { DecideLoginRoleUsecase } from './decide-login-role.usecase';
import { EnrichLoginWithIdentityUsecase } from './enrich-login-with-identity.usecase';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 密码登录用例
 * 负责编排密码登录的完整流程（Execute → Decide → Enrich）
 */
@Injectable()
export class LoginWithPasswordUsecase {
  constructor(
    private readonly validateLoginUsecase: ValidateLoginUsecase,
    private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase,
    private readonly decideLoginRoleUsecase: DecideLoginRoleUsecase,
    private readonly enrichLoginWithIdentityUsecase: EnrichLoginWithIdentityUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginWithPasswordUsecase.name);
  }

  /**
   * 执行密码登录（三段式编排）
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
      // 验证登录凭据
      const account = await this.validateLoginUsecase.execute({ loginName, loginPassword });

      // Execute: 执行基础登录流程
      const basicResult = await this.executeLoginFlowUsecase.execute({
        accountId: account.id,
        ip,
        audience,
      });

      // Decide: 决策最终角色
      const { finalRole } = this.decideLoginRoleUsecase.execute(
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
}
