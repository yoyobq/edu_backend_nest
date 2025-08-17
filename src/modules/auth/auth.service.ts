// src/modules/auth/auth.service.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { TokenHelper } from '@core/common/token/token.helper';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityUnionType } from '@src/adapters/graphql/account/dto/identity/identity-union.type';
import { LoginResult } from '@src/adapters/graphql/account/dto/login-result.dto';
import { JwtPayload } from '@src/types/jwt.types';
import { PinoLogger } from 'nestjs-pino';

/**
 * 认证服务 - 提供认证相关的技术实现
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly tokenHelper: TokenHelper,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /**
   * 验证客户端类型是否有效
   * @param audience 客户端类型
   * @returns 是否有效
   */
  validateAudience(audience: string): boolean {
    const configAudience = this.configService.get<string>('jwt.audience');
    return this.tokenHelper.validateAudience(audience, configAudience!);
  }

  /**
   * 生成访问令牌和刷新令牌
   * @param payload JWT 载荷
   * @returns 令牌对
   */
  generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.tokenHelper.generateAccessToken({ payload });
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload });

    return { accessToken, refreshToken };
  }

  /**
   * 创建登录结果对象
   * @param params 登录结果参数
   * @returns 登录结果
   */
  createLoginResult({
    accessToken,
    refreshToken,
    accountId,
    role,
    identity,
  }: {
    accessToken: string;
    refreshToken: string;
    accountId: number;
    role: IdentityTypeEnum;
    identity?: IdentityUnionType;
  }): LoginResult {
    return {
      accessToken,
      refreshToken,
      accountId,
      role,
      identity,
    };
  }

  /**
   * 记录登录成功日志
   * @param params 日志参数
   */
  logLoginSuccess({
    accountId,
    loginName,
    accessGroup,
    role,
    ip,
    audience,
  }: {
    accountId: number;
    loginName: string;
    accessGroup: string;
    role: IdentityTypeEnum;
    ip?: string;
    audience?: string;
  }): void {
    this.logger.info(
      {
        accountId,
        loginName,
        accessGroup,
        role,
        ip,
        audience,
      },
      `从 ${audience} 登录成功`,
    );
  }

  /**
   * 记录登录失败日志
   * @param params 日志参数
   */
  logLoginFailure({
    loginName,
    accountId,
    ip,
    audience,
    error,
  }: {
    loginName?: string;
    accountId?: number;
    ip?: string;
    audience?: string;
    error: string;
  }): void {
    this.logger.error(
      {
        loginName,
        accountId,
        ip,
        audience,
        error,
      },
      '用户登录失败',
    );
  }
}
