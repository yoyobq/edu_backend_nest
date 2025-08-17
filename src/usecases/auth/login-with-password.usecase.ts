// src/usecases/auth/login-with-password.usecase.ts
import { LoginResult } from '@adapters/graphql/account/dto/login-result.dto';
import { AuthLoginInput } from '@adapters/graphql/auth/dto/auth-login.input';
import { isDomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { ValidateLoginUsecase } from '@usecases/account/validate-login.usecase';
import { PinoLogger } from 'nestjs-pino';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 密码登录用例
 * 负责编排密码登录的完整业务流程
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
   * @param input 登录参数
   * @returns 登录结果
   */
  async execute({ loginName, loginPassword, ip, audience }: AuthLoginInput): Promise<LoginResult> {
    try {
      // 1. 验证登录信息
      const account = await this.validateLoginUsecase.execute({ loginName, loginPassword });

      // 2. 执行通用登录流程
      return await this.executeLoginFlowUsecase.execute({
        accountId: account.id,
        ip,
        audience,
      });
    } catch (error) {
      this.logger.error(
        {
          loginName,
          ip,
          audience,
          error: error instanceof Error ? error.message : '未知错误',
          errorCode: isDomainError(error) ? error.code : undefined,
        },
        '用户登录失败',
      );

      // 直接重新抛出错误，让上层适配器处理
      throw error;
    }
  }
}
