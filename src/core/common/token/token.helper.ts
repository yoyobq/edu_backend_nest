// src/core/common/token/token.helper.ts

import {
  GenerateAccessTokenParams,
  GenerateRefreshTokenParams,
  JwtPayload,
} from '@app-types/jwt.types';
import { Injectable } from '@nestjs/common';
import { JsonWebTokenError, JwtService, NotBeforeError, TokenExpiredError } from '@nestjs/jwt';
import { PinoLogger } from 'nestjs-pino';
import { DomainError, JWT_ERROR } from '../errors/domain-error'; // 新增导入

/**
 * Token 助手类
 * 提供 JWT Token 的生成、验证等功能
 */
@Injectable()
export class TokenHelper {
  constructor(
    private readonly jwtService: JwtService,
    private readonly logger: PinoLogger,
  ) {
    // 设置 logger 的上下文
    this.logger.setContext(TokenHelper.name);
  }

  /**
   * 生成访问令牌
   * @param params 对象参数
   * @param params.payload JWT 载荷数据
   * @param params.audience 可选，用于覆盖默认 audience
   * @param params.expiresIn 可选，用于覆盖默认 JWT 签名时间
   * @returns 生成的 JWT Access Token 字符串
   */
  generateAccessToken({ payload, expiresIn, audience }: GenerateAccessTokenParams): string {
    try {
      const accessPayload = {
        ...payload,
        type: 'access',
      };

      const signOptions: Record<string, unknown> = {};

      if (expiresIn) {
        signOptions.expiresIn = expiresIn;
      }

      if (audience) {
        signOptions.audience = audience;
      }

      const token = this.jwtService.sign(accessPayload, signOptions);

      return token;
    } catch (error) {
      this.logger.error(
        {
          userId: payload.sub,
          tokenType: 'access',
          error: error instanceof Error ? error.message : '未知错误',
          payload,
        },
        'access token 生成失败',
      );

      throw new DomainError(
        JWT_ERROR.ACCESS_TOKEN_GENERATION_FAILED,
        `access token 生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { userId: payload.sub, tokenType: 'access' },
        error,
      );
    }
  }

  /**
   * 生成刷新令牌
   * @param params 对象参数
   * @param params.payload JWT 载荷数据
   * @returns 生成的 JWT Refresh Token 字符串
   */
  generateRefreshToken({ payload, tokenVersion = 1 }: GenerateRefreshTokenParams): string {
    try {
      const refreshPayload = {
        sub: payload.sub,
        type: 'refresh',
        tokenVersion: tokenVersion,
      };

      const token = this.jwtService.sign(refreshPayload);

      return token;
    } catch (error) {
      this.logger.error(
        {
          userId: payload.sub,
          tokenType: 'refresh',
          error: error instanceof Error ? error.message : '未知错误',
          payload,
        },
        'refresh token 生成失败',
      );

      throw new DomainError(
        JWT_ERROR.REFRESH_TOKEN_GENERATION_FAILED,
        `refresh token 生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { userId: payload.sub, tokenType: 'refresh' },
        error,
      );
    }
  }

  /**
   * 验证 audience 是否有效
   * @param audience 前端传入的 audience
   * @param configAudience 后端配置的 audience 字符串
   * @returns 是否有效
   */
  validateAudience(audience: string, configAudience: string): boolean {
    if (!audience || !configAudience) {
      return false;
    }

    const allowedAudiences = configAudience.split(',').map((aud) => aud.trim());
    return allowedAudiences.includes(audience);
  }

  /**
   * 验证并解析 Token
   * @param params 对象参数
   * @param params.token JWT Token
   * @returns 解析后的载荷数据
   */
  verifyToken({ token }: { token: string }): JwtPayload {
    try {
      // 解析 + 校验签名 + 校验过期 + 校验 issuer/audience
      const payload = this.jwtService.verify<JwtPayload>(token);

      return payload;
    } catch (error) {
      // 区分错误类型
      if (error instanceof TokenExpiredError) {
        // 过期是正常行为，不记录
        throw new DomainError(
          JWT_ERROR.TOKEN_EXPIRED,
          `Token 已过期: ${error instanceof Error ? error.message : 'Token 已过期'}`,
          { tokenPrefix: token.substring(0, 20) + '...' },
          error,
        );
      }

      if (error instanceof NotBeforeError) {
        // 记录安全相关的 Token 验证失败
        this.logger.error(
          {
            error: error instanceof Error ? error.message : 'Token 未生效',
            tokenPrefix: token.substring(0, 20) + '...', // 只记录 token 前缀，避免泄露完整 token
            timestamp: new Date().toISOString(),
          },
          'JWT Token 手动验证失败 - 关注潜在的安全问题',
        );

        throw new DomainError(
          JWT_ERROR.TOKEN_NOT_BEFORE,
          `Token 验证失败: ${error instanceof Error ? error.message : 'Token 未生效'}`, // 修改为统一前缀
          { tokenPrefix: token.substring(0, 20) + '...' },
          error,
        );
      }

      if (error instanceof JsonWebTokenError) {
        // 记录安全相关的 Token 验证失败
        this.logger.error(
          {
            error: error instanceof Error ? error.message : '非法 token，结构错误、伪造等',
            tokenPrefix: token.substring(0, 20) + '...', // 只记录 token 前缀，避免泄露完整 token
            timestamp: new Date().toISOString(),
          },
          'JWT Token 手动验证失败 - 关注潜在的安全问题',
        );

        throw new DomainError(
          JWT_ERROR.TOKEN_INVALID,
          `Token 验证失败: ${error instanceof Error ? error.message : '非法 token'}`,
          { tokenPrefix: token.substring(0, 20) + '...' },
          error,
        );
      }

      throw new DomainError(
        JWT_ERROR.TOKEN_VERIFICATION_FAILED,
        `Token 验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
        { tokenPrefix: token.substring(0, 20) + '...' },
        error,
      );
    }
  }

  /**
   * 解析 Token（不验证签名）
   * @param params 对象参数
   * @param params.token JWT Token
   * @returns 解析后的载荷数据，若 token 非法（如格式错误），返回 null
   */
  decodeToken({ token }: { token: string }): JwtPayload | null {
    try {
      const payload = this.jwtService.decode<JwtPayload>(token);
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * 检查 Token 是否即将过期
   * @param params 对象参数
   * @param params.token JWT Token
   * @param params.thresholdMinutes 过期阈值（分钟），默认 15 分钟
   * @returns 是否即将过期
   */
  isTokenExpiringSoon({
    token,
    thresholdMinutes = 15,
  }: {
    token: string;
    thresholdMinutes?: number;
  }): boolean {
    try {
      const payload = this.decodeToken({ token });
      if (!payload?.exp) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      const threshold = thresholdMinutes * 60;
      const isExpiringSoon = payload.exp - now <= threshold;

      return isExpiringSoon;
    } catch {
      return true; // 解析失败时认为需要刷新
    }
  }

  /**
   * 从用户信息生成标准的 JWT Payload
   * @param params 对象参数
   * @param params.id 用户 ID
   * @param params.loginName 登录名
   * @param params.loginEmail 登录邮箱
   * @param params.accessGroup 访问组
   * @param params.type Token 类型
   * @returns JWT Payload
   */
  /**
   * 从用户信息创建 JWT payload
   * @param user 用户信息对象
   * @returns JWT payload
   */
  createPayloadFromUser({
    id,
    nickname,
    loginEmail,
    accessGroup,
  }: {
    id: number;
    nickname: string; // 使用昵称作为 username
    loginEmail: string | null; // 允许为空
    accessGroup: string[];
  }): Pick<JwtPayload, 'sub' | 'username' | 'email' | 'accessGroup'> {
    const payload: Pick<JwtPayload, 'sub' | 'username' | 'email' | 'accessGroup'> = {
      sub: id,
      username: nickname, // 昵称作为 JWT 中的 username
      email: loginEmail,
      accessGroup: accessGroup,
    };
    return payload;
  }
}
