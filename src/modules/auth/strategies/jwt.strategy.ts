// src/modules/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { PinoLogger } from 'nestjs-pino';
import { ExtractJwt, JwtFromRequestFunction, Strategy } from 'passport-jwt';
import { TokenHelper } from '../../../core/common/token/token.helper';
import { JwtPayload } from '../../../types/jwt.types';
import { AccountService } from '../../account/account.service';

/**
 * JWT 认证策略
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly accountService: AccountService,
    private readonly tokenHelper: TokenHelper,
    private readonly logger: PinoLogger,
  ) {
    // 确保配置值不为 undefined
    const secret = configService.get<string>('jwt.secret');
    const issuer = configService.get<string>('jwt.issuer');
    const audience = configService.get<string>('jwt.audience');

    if (!secret) {
      throw new Error('JWT secret 配置缺失');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const jwtExtractor: JwtFromRequestFunction = ExtractJwt.fromAuthHeaderAsBearerToken();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      jwtFromRequest: jwtExtractor,
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: issuer || undefined,
      audience: audience || undefined,
    });

    // 设置 logger 的上下文
    this.logger.setContext(JwtStrategy.name);
  }

  /**
   * 验证 JWT payload
   * @param payload JWT 载荷
   * @returns 用户信息
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const userId = payload?.sub;
    try {
      // 验证 token 类型
      if (payload.type !== 'access') {
        throw new UnauthorizedException('无效的 token 类型');
      }

      // 验证用户是否存在且状态正常，不存在会抛出异常
      const user = await this.accountService.getUserWithAccessGroup({ accountId: userId });

      if (!user) {
        throw new UnauthorizedException('用户不存在或已禁用');
      }

      // 返回用户信息，会被注入到 request.user 中
      return payload;
    } catch (error) {
      // 确保错误类型安全
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // 记录未知错误
      this.logger.error(
        {
          userId,
          error: error instanceof Error ? error.message : '未知错误',
        },
        'JWT 验证失败',
      );

      throw new UnauthorizedException('认证失败');
    }
  }
}
