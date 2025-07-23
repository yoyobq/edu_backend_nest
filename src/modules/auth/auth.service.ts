// src/modules/auth/auth.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountStatus } from 'src/types/models/account.types';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/entities/account.entity';
import { AuthLoginResult } from './dto/auth-login-result.dto';
import { AuthLoginArgs } from './dto/auth.args';

/**
 * 认证服务
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  /**
   * 用户登录认证
   * @param loginArgs 登录参数
   * @returns 登录结果
   */
  async login(loginArgs: AuthLoginArgs): Promise<AuthLoginResult> {
    // 类型守卫函数确保类型安全
    const validateLoginArgs = (args: unknown): args is AuthLoginArgs => {
      return (
        typeof args === 'object' && args !== null && 'loginName' in args && 'loginPassword' in args
      );
    };

    if (!validateLoginArgs(loginArgs)) {
      return {
        success: false,
        errorMessage: '参数格式错误',
      };
    }

    const loginName = loginArgs.loginName;
    const loginPassword = loginArgs.loginPassword;

    // 根据登录名或邮箱查找账户
    const account = await this.accountRepository
      .createQueryBuilder('account')

      .where('account.loginName = :loginName', { loginName })

      .orWhere('account.loginEmail = :loginEmail', { loginEmail: loginName })
      .getOne();

    if (!account) {
      return {
        success: false,
        errorMessage: '账户不存在',
      };
    }

    // 检查账户状态
    if (account.status !== AccountStatus.ACTIVE) {
      return {
        success: false,
        errorMessage: '账户已被禁用',
      };
    }

    // 直接对比密码（测试用，生产环境应该用哈希对比）
    if (account.loginPassword !== loginPassword) {
      return {
        success: false,
        errorMessage: '密码错误',
      };
    }

    return {
      success: true,
      userId: account.id,
    };
  }
}
