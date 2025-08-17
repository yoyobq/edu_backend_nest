// src/usecases/auth/execute-login-flow.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { IdentityModel, LoginResultModel } from '@app-types/models/auth.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors';
import { TokenHelper } from '@core/common/token/token.helper';
import { AccountService } from '@modules/account/account.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/**
 * 执行登录流程用例
 * 负责生成令牌、记录登录历史等
 */
@Injectable()
export class ExecuteLoginFlowUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly tokenHelper: TokenHelper,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExecuteLoginFlowUsecase.name);
  }

  /**
   * 执行登录流程
   * @param params 登录流程参数
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
    // 验证 audience 是否有效
    if (audience) {
      const configAudience = this.configService.get<string>('jwt.audience');
      if (!this.tokenHelper.validateAudience(audience, configAudience!)) {
        throw new DomainError(AUTH_ERROR.INVALID_AUDIENCE, `无效的客户端类型: ${audience}`);
      }
    }

    // 获取用户完整信息（包括 accessGroup）
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 验证必要字段
    if (!userInfo.account.loginName) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_NOT_FOUND, '用户登录名不存在');
    }

    // 构建用户完整信息对象
    const userWithAccessGroup = {
      id: accountId,
      loginName: userInfo.account.loginName,
      loginEmail: userInfo.account.loginEmail,
      accessGroup: userInfo.accessGroup,
    };

    // 获取账户信息以获取 identityHint
    const account = await this.accountService.findOneById(accountId);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 创建 JWT payload
    const jwtPayload = this.tokenHelper.createPayloadFromUser(userWithAccessGroup);

    // 生成令牌 - 使用独立的方法
    const accessToken = this.tokenHelper.generateAccessToken({ payload: jwtPayload });
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload: jwtPayload });

    // 记录登录历史
    await this.accountService.recordLoginHistory(accountId, new Date().toISOString(), ip, audience);

    // 构建身份信息
    const identity: IdentityModel | null = account.identityHint
      ? {
          role: account.identityHint as IdentityTypeEnum,
        }
      : null;

    // 返回登录结果
    return {
      accessToken,
      refreshToken,
      accountId,
      role: (account.identityHint as IdentityTypeEnum) || IdentityTypeEnum.REGISTRANT,
      identity,
    };
  }
}
