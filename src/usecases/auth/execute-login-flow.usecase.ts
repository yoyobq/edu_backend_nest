// src/usecases/auth/execute-login-flow.usecase.ts

import { BasicLoginResult } from '@app-types/auth/login-flow.types';
import {
  AccountStatus,
  AudienceTypeEnum,
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
 * 用户数据集合接口
 */
interface UserDataCollection {
  userWithAccessGroup: {
    id: number;
    loginEmail: string | null;
    accessGroup: IdentityTypeEnum[];
  };
  account: {
    id: number;
    loginName: string | null;
    loginEmail: string | null;
    status: string;
    identityHint: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  userInfo: {
    id: number;
    accountId: number;
    nickname: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

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
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): Promise<BasicLoginResult> {
    // 验证 audience 类型安全性
    this.validateAudience(audience);

    // 获取用户相关数据
    const userData = await this.fetchUserData(accountId);

    // 生成 JWT tokens，传入 audience 参数
    const tokens = this.generateTokens(userData, audience);

    // 记录登录历史
    await this.handleLoginHistory({ accountId, ip, audience, provider });

    // 构建并返回基础登录结果
    return this.buildLoginResult(userData, tokens);
  }

  /**
   * 验证 audience 参数
   * @param audience 客户端类型枚举
   */
  private validateAudience(audience?: AudienceTypeEnum): void {
    if (audience) {
      const allowedAudiences =
        this.configService.get<AudienceTypeEnum[]>('jwt.allowedAudiences') ?? [];
      if (!this.validateAudienceEnum(audience, allowedAudiences)) {
        throw new DomainError(AUTH_ERROR.INVALID_AUDIENCE, `无效的客户端类型: ${audience}`);
      }
    }
  }

  /**
   * 获取用户相关数据
   * @param accountId 账户 ID
   * @returns 用户数据集合
   */
  private async fetchUserData(accountId: number): Promise<UserDataCollection> {
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

    // 检查账户状态
    if (account.status !== AccountStatus.ACTIVE) {
      throw new DomainError(AUTH_ERROR.ACCOUNT_INACTIVE, '账户未激活');
    }

    // 获取用户详细信息
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    return { userWithAccessGroup, account, userInfo };
  }

  /**
   * 生成 JWT tokens
   * @param userData 用户数据集合
   * @param audience 客户端类型（用于 JWT audience 声明）
   * @returns JWT tokens 对象
   */
  private generateTokens(
    userData: UserDataCollection,
    audience?: AudienceTypeEnum,
  ): {
    accessToken: string;
    refreshToken: string;
  } {
    const { userWithAccessGroup, userInfo } = userData;

    // 创建 JWT payload
    const jwtPayload = this.tokenHelper.createPayloadFromUser({
      id: userWithAccessGroup.id,
      nickname: userInfo.nickname,
      loginEmail: userWithAccessGroup.loginEmail,
      accessGroup: userWithAccessGroup.accessGroup,
    });

    // 生成 tokens，传入 audience 参数
    const accessToken = this.tokenHelper.generateAccessToken({
      payload: jwtPayload,
      audience: audience, // 传递 audience 参数
    });

    const refreshToken = this.tokenHelper.generateRefreshToken({
      payload: { sub: jwtPayload.sub },
      audience: audience, // 传递 audience 参数
    });

    return { accessToken, refreshToken };
  }

  /**
   * 处理登录历史记录
   * @param params 登录历史参数
   */
  private async handleLoginHistory({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip?: string;
    audience?: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): Promise<void> {
    try {
      if (provider) {
        this.logger.info(`第三方登录: accountId=${accountId}, provider=${provider}, ip=${ip}`);
      }
      await this.accountService.recordLoginHistory(
        accountId,
        new Date().toISOString(),
        ip,
        audience,
      );
    } catch (error) {
      this.logger.error(
        {
          accountId,
          ip,
          audience,
          provider,
          error: error instanceof Error ? error.message : String(error),
        },
        '记录登录历史失败',
      );
    }
  }

  /**
   * 构建登录结果
   * @param userData 用户数据集合
   * @param tokens JWT tokens
   * @returns 基础登录结果
   */
  private buildLoginResult(
    userData: UserDataCollection,
    tokens: { accessToken: string; refreshToken: string },
  ): BasicLoginResult {
    const { userWithAccessGroup, account, userInfo } = userData;

    return {
      tokens,
      accountId: account.id,
      roleFromHint: this.parseIdentityHint(account.identityHint),
      accessGroup: userWithAccessGroup.accessGroup,
      account: {
        id: account.id,
        loginName: account.loginName,
        loginEmail: account.loginEmail,
        status: account.status,
        identityHint: this.parseIdentityHint(account.identityHint),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      userInfo: {
        id: userInfo.id,
        accountId: userInfo.accountId,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl,
        createdAt: userInfo.createdAt,
        updatedAt: userInfo.updatedAt,
      },
    };
  }

  /**
   * 验证 audience 枚举值是否有效
   * @param audience 客户端类型枚举
   * @param allowedAudiences 允许的客户端类型列表
   * @returns 是否有效
   */
  private validateAudienceEnum(
    audience: AudienceTypeEnum,
    allowedAudiences: AudienceTypeEnum[],
  ): boolean {
    return allowedAudiences.includes(audience);
  }

  /**
   * 安全解析身份提示字符串为枚举类型
   * @param identityHint 身份提示字符串
   * @returns 解析后的枚举值或 null
   */
  private parseIdentityHint(identityHint: string | null): IdentityTypeEnum | null {
    if (!identityHint) {
      return null;
    }

    // 检查是否为有效的枚举值
    const enumValues = Object.values(IdentityTypeEnum) as string[];
    if (enumValues.includes(identityHint)) {
      return identityHint as IdentityTypeEnum;
    }

    // 如果不是有效枚举值，记录警告并返回 null
    this.logger.warn({ identityHint, validValues: enumValues }, '无效的身份提示值，将返回 null');
    return null;
  }

  /**
   * 记录登录历史
   * @param params 登录历史参数
   */
  private recordLoginHistory({
    accountId,
    ip,
    audience,
    provider,
  }: {
    accountId: number;
    ip: string;
    audience: AudienceTypeEnum;
    provider?: ThirdPartyProviderEnum;
  }): void {
    // 这里可以调用登录历史服务记录登录信息
    this.logger.info({ accountId, ip, audience, provider }, '用户登录成功');
  }
}
