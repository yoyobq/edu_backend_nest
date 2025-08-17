// src/usecases/auth/login-by-account-id.usecase.ts
import { LoginResult } from '@adapters/graphql/account/dto/login-result.dto';
import { isDomainError } from '@core/common/errors';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ExecuteLoginFlowUsecase } from './execute-login-flow.usecase';

/**
 * 通过账户 ID 登录用例
 * 负责编排第三方登录的业务流程
 */
@Injectable()
export class LoginByAccountIdUsecase {
  constructor(
    private readonly executeLoginFlowUsecase: ExecuteLoginFlowUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginByAccountIdUsecase.name);
  }

  /**
   * 执行通过账户 ID 登录
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
  }): Promise<LoginResult> {
    try {
      return await this.executeLoginFlowUsecase.execute({ accountId, ip, audience });
    } catch (error) {
      this.logger.error(
        {
          accountId,
          ip,
          audience,
          error: error instanceof Error ? error.message : '未知错误',
          errorCode: isDomainError(error) ? error.code : undefined,
        },
        '第三方登录失败',
      );

      // 直接重新抛出错误，让上层适配器处理
      throw error;
    }
  }
}
