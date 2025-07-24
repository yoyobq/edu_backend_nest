// src/modules/auth/auth.service.ts

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountService } from '../account/account.service';
import { AuthLoginResult } from './dto/auth-login-result.dto';
import { AuthLoginArgs } from './dto/auth.args';

/**
 * 认证服务
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly accountService: AccountService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 用户登录认证
   * @param args 登录参数
   * @returns 登录结果
   */
  async login(args: AuthLoginArgs): Promise<AuthLoginResult> {
    try {
      // 验证登录信息
      const account = await this.accountService.validateLogin(args);

      // 记录登录历史
      // 在 login 方法中，修改 recordLoginHistory 的调用
      const timestamp = new Date().toISOString();
      await this.accountService.recordLoginHistory(account.id, timestamp, args.ip, args.audience);

      // 生成 JWT token
      const token = this.jwtService.sign({ sub: account.id });

      return {
        success: true,
        token,
        userId: account.id,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : '登录失败',
      };
    }
  }
}
