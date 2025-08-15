// src/modules/auth/auth.service.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { TokenHelper } from '@core/common/token/token.helper';
import { AccountService } from '@modules/account/account.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityUnionType } from '@src/adapters/graphql/account/dto/identity/identity-union.type';
import { LoginResult } from '@src/adapters/graphql/account/dto/login-result.dto';
import { PinoLogger } from 'nestjs-pino';
import { AuthLoginInput } from '../../adapters/graphql/auth/dto/auth-login.input';

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
  async login({ loginName, loginPassword, ip, audience }: AuthLoginInput): Promise<LoginResult> {
    try {
      // 验证登录信息
      const account = await this.accountService.validateLogin({ loginName, loginPassword });

      // 执行通用登录流程
      return await this.executeLoginFlow({
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
  }): Promise<LoginResult> {
    try {
      // 执行通用登录流程
      return await this.executeLoginFlow({
        accountId,
        ip,
        audience,
      });
    } catch (error) {
      this.logger.error(
        {
          accountId,
          ip,
          audience,
          error: error instanceof Error ? error.message : '未知错误',
        },
        `从 ${audience} 登录失败`,
      );

      throw new UnauthorizedException(error instanceof Error ? error.message : '第三方登录失败');
    }
  }

  /**
   * 执行通用登录流程
   * @param params 登录参数
   * @returns 登录结果
   * @throws UnauthorizedException 登录失败时抛出异常
   */
  private async executeLoginFlow({
    accountId,
    ip,
    audience,
  }: {
    accountId: number;
    ip?: string;
    audience?: string;
  }): Promise<LoginResult> {
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

    // 获取账户信息以获取 identityHint
    const account = await this.accountService.findOneById(accountId);

    // 记录登录历史
    const timestamp = new Date().toISOString();
    await this.accountService.recordLoginHistory(accountId, timestamp, ip, audience);

    // 创建 JWT payload
    const payload = this.tokenHelper.createPayloadFromUser({ ...userWithAccessGroup });

    // 生成 access token
    const accessToken = this.tokenHelper.generateAccessToken({ payload });

    // 生成 refresh token
    const refreshToken = this.tokenHelper.generateRefreshToken({ payload });

    // 确定用户角色（从 identityHint 获取，默认为 REGISTRANT）
    const role = (account?.identityHint as IdentityTypeEnum) || IdentityTypeEnum.REGISTRANT;

    // 获取用户身份信息（暂时设为 undefined，需要根据实际业务逻辑实现）
    const identity: IdentityUnionType | undefined = undefined; // TODO: 根据 role 获取具体的身份信息

    // 记录成功日志
    this.logger.info(
      {
        accountId,
        loginName: userWithAccessGroup.loginName,
        accessGroup: userWithAccessGroup.accessGroup,
        role,
        ip,
        audience,
      },
      `从 ${audience} 登录成功`,
    );

    return {
      accessToken,
      refreshToken,
      accountId,
      role,
      identity,
    };
  }
}
