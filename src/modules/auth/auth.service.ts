// src/modules/auth/auth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { TokenHelper } from '../../core/common/token/token.helper';
import { AccountService } from '../account/account.service';
import { AuthLoginResult } from './dto/auth-login-result';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证服务
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly accountService: AccountService,
    private readonly tokenHelper: TokenHelper,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /**
   * 用户登录认证
   * @param input 登录参数
   * @returns 登录结果
   * @throws UnauthorizedException 登录失败时抛出异常
   */
  async login({
    loginName,
    loginPassword,
    ip,
    audience,
  }: AuthLoginInput): Promise<AuthLoginResult> {
    try {
      // 验证 audience 是否有效
      if (audience) {
        const configAudience = this.configService.get<string>('jwt.audience');
        if (!this.tokenHelper.validateAudience(audience, configAudience!)) {
          throw new UnauthorizedException(`无效的客户端类型: ${audience}`);
        }
      }

      // 验证登录信息
      const account = await this.accountService.validateLogin({ loginName, loginPassword });

      // 获取用户完整信息（包括 accessGroup）
      const userWithAccessGroup = await this.accountService.getUserWithAccessGroup({
        accountId: account.id,
      });

      // 记录登录历史
      const timestamp = new Date().toISOString();
      await this.accountService.recordLoginHistory(account.id, timestamp, ip, audience);

      // 创建 JWT payload
      const payload = this.tokenHelper.createPayloadFromUser({ ...userWithAccessGroup });

      // 生成 access token
      const accessToken = this.tokenHelper.generateAccessToken({ payload });

      // 生成 refresh token
      const refreshToken = this.tokenHelper.generateRefreshToken({ payload });

      this.logger.info(
        {
          userId: account.id,
          loginName: userWithAccessGroup.loginName,
          accessGroup: userWithAccessGroup.accessGroup,
          ip,
          audience,
        },
        '用户登录成功',
      );

      return {
        accessToken,
        refreshToken,
        userId: account.id,
      };
    } catch (error) {
      this.logger.error(
        {
          loginName,
          ip,
          audience,
          error: error instanceof Error ? error.message : '未知错误',
        },
        '用户登录失败',
      );

      throw new UnauthorizedException(error instanceof Error ? error.message : '登录失败');
    }
  }

  /**
   * 通过账户 ID 进行登录（用于第三方登录）
   * @param accountId 账户 ID
   * @param ip 登录 IP
   * @param audience 客户端类型
   * @returns 登录结果
   * @throws UnauthorizedException 登录失败时抛出异常
   */
  async loginByAccountId({
    accountId,
    ip,
    audience,
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
  }): Promise<AuthLoginResult> {
    try {
      // 验证 audience 是否有效
      if (audience) {
        const configAudience = this.configService.get<string>('jwt.audience');
        if (!this.tokenHelper.validateAudience(audience, configAudience!)) {
          throw new UnauthorizedException(`无效的客户端类型: ${audience}`);
        }
      }

      // 获取用户完整信息（包括 accessGroup）
      const userWithAccessGroup = await this.accountService.getUserWithAccessGroup({
        accountId,
      });

      // 记录登录历史
      const timestamp = new Date().toISOString();
      await this.accountService.recordLoginHistory(accountId, timestamp, ip, audience);

      // 创建 JWT payload
      const payload = this.tokenHelper.createPayloadFromUser({ ...userWithAccessGroup });

      // 生成 access token
      const accessToken = this.tokenHelper.generateAccessToken({ payload });

      // 生成 refresh token
      const refreshToken = this.tokenHelper.generateRefreshToken({ payload });

      this.logger.info(
        {
          userId: accountId,
          loginName: userWithAccessGroup.loginName,
          accessGroup: userWithAccessGroup.accessGroup,
          ip,
          audience,
        },
        '第三方登录成功',
      );

      return {
        accessToken,
        refreshToken,
        userId: accountId,
      };
    } catch (error) {
      this.logger.error(
        {
          accountId,
          ip,
          audience,
          error: error instanceof Error ? error.message : '未知错误',
        },
        '第三方登录失败',
      );

      throw new UnauthorizedException(error instanceof Error ? error.message : '第三方登录失败');
    }
  }
}
