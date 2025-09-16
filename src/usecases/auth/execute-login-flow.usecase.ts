// src/usecases/auth/execute-login-flow.usecase.ts

import { BasicLoginResult } from '@app-types/auth/login-flow.types';
import {
  AccountStatus,
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors/domain-error';
import { TokenHelper } from '@core/common/token/token.helper';
import { AccountService } from '@modules/account/base/services/account.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/**
 * 执行登录流程用例
 * 职责：认证、发券、记录登录历史，返回基础登录信息
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
   * @param params 登录参数
   * @returns 基础登录结果
   */
  async execute({
    accountId,
    ip,
    audience,
    provider, // 添加 provider 参数
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
    provider?: ThirdPartyProviderEnum; // 添加 provider 参数类型
  }): Promise<BasicLoginResult> {
    // 添加 audience 校验逻辑
    if (audience) {
      const cfgAudience = this.configService.get<string>('jwt.audience');
      if (!this.tokenHelper.validateAudience(audience, cfgAudience!)) {
        throw new DomainError(AUTH_ERROR.INVALID_AUDIENCE, `无效的客户端类型: ${audience}`);
      }
    }

    // 获取用户信息和访问组
    const userWithAccessGroup = await this.accountService.getUserWithAccessGroup(accountId);
    if (!userWithAccessGroup) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 获取账户信息
    const account = await this.accountService.findOneById(accountId);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 检查账户状态 - 使用枚举值而不是字符串字面量
    if (account.status !== AccountStatus.ACTIVE) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '账户未激活');
    }

    // 获取用户详细信息
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 创建 JWT payload - 需要包含 nickname 字段
    const jwtPayload = this.tokenHelper.createPayloadFromUser({
      id: userWithAccessGroup.id,
      nickname: userInfo.nickname,
      loginEmail: userWithAccessGroup.loginEmail,
      accessGroup: userWithAccessGroup.accessGroup,
    });

    // 生成令牌 - 使用独立的方法
    const accessToken = this.tokenHelper.generateAccessToken({ payload: jwtPayload });
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload: jwtPayload });

    // 记录登录历史（如果需要的话）
    if (provider) {
      this.logger.info(`第三方登录: accountId=${accountId}, provider=${provider}, ip=${ip}`);
      // 这里可以添加登录历史记录逻辑
    }

    await this.accountService.recordLoginHistory(accountId, new Date().toISOString(), ip, audience);

    // 返回基础登录结果
    return {
      tokens: {
        accessToken,
        refreshToken,
      },
      accountId,
      roleFromHint: account.identityHint as IdentityTypeEnum | null,
      accessGroup: userWithAccessGroup.accessGroup,
      account: {
        id: account.id,
        loginName: account.loginName ?? null, // 修复：保持 null 语义，方便前端判断"未设置"
        loginEmail: account.loginEmail ?? null, // 修复：保持 null 语义，方便前端判断"未设置"
        status: account.status,
        identityHint: account.identityHint as IdentityTypeEnum | null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      userInfo: {
        id: userInfo.id,
        accountId: userInfo.accountId,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl, // 修复：直接使用 avatarUrl 字段
        createdAt: userInfo.createdAt,
        updatedAt: userInfo.updatedAt,
      },
    };
  }
}
