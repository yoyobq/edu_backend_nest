// src/usecases/auth/login-with-password.usecase.ts

import { AuthLoginModel, LoginResultModel } from '@app-types/models/auth.types';
import { isDomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { ValidateLoginUsecase } from '@usecases/account/validate-login.usecase';
import { PinoLogger } from 'nestjs-pino';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 密码登录用例
 * 负责编排密码登录的完整流程
 */
@Injectable()
export class LoginWithPasswordUsecase {
  constructor(
    private readonly validateLoginUsecase: ValidateLoginUsecase,
    private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginWithPasswordUsecase.name);
  }

  /**
   * 执行密码登录
   * @param params 登录参数
   * @returns 登录结果
   */
  async execute({
    loginName,
    loginPassword,
    ip,
    audience,
  }: AuthLoginModel): Promise<LoginResultModel> {
    try {
      // 验证登录凭据
      const account = await this.validateLoginUsecase.execute({ loginName, loginPassword });

      // 执行登录流程
      const loginResult = await this.executeLoginFlowUsecase.execute({
        accountId: account.id,
        ip,
        audience,
      });

      return loginResult;
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
