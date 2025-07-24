// src/modules/account/account.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountStatus } from 'src/types/models/account.types';
import { Repository } from 'typeorm';
import { AuthLoginArgs } from '../auth/dto/auth.args';
import { AccountEntity } from './entities/account.entity';
import { LoginHistoryItem } from './graphql/types';

// 删除这个重复的接口定义
// export interface LoginHistoryRecord {
//   ip?: string;
//   timestamp: string;
//   audience?: string;
// }

/**
 * 账户服务
 */
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  /**
   * 验证用户登录信息
   * @param args 登录参数
   * @returns 验证通过的账户信息
   * @throws 验证失败时抛出错误
   */
  async validateLogin(args: AuthLoginArgs): Promise<AccountEntity> {
    const { loginName, loginPassword } = args;

    // 根据登录名或邮箱查找账户
    const account = await this.accountRepository
      .createQueryBuilder('account')
      .where('account.loginName = :loginName', { loginName })
      .orWhere('account.loginEmail = :loginEmail', { loginEmail: loginName })
      .getOne();

    if (!account) {
      throw new Error('账户不存在');
    }

    // 检查账户状态
    if (account.status !== AccountStatus.ACTIVE) {
      throw new Error('账户已被禁用');
    }

    // 验证密码（生产环境应该使用哈希对比）
    if (account.loginPassword !== loginPassword) {
      throw new Error('密码错误');
    }

    return account;
  }

  /**
   * 记录用户登录历史
   * @param accountId 账户 ID
   * @param timestamp 登录时间戳
   * @param ip 登录 IP
   * @param audience 客户端类型
   */
  async recordLoginHistory(
    accountId: number,
    timestamp: string,
    ip?: string,
    audience?: string,
  ): Promise<void> {
    // 获取当前账户的登录历史
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['recentLoginHistory'],
    });

    // 构建新的登录历史项
    const newHistoryItem: LoginHistoryItem = {
      ip: ip || '',
      timestamp,
      audience,
    };

    // 获取现有历史记录，保留最近 4 条，加上新的一条总共 5 条
    const existingHistory = account?.recentLoginHistory || [];
    const updatedHistory = [newHistoryItem, ...existingHistory.slice(0, 4)];

    // 更新账户的最近登录历史
    await this.accountRepository.update(accountId, {
      recentLoginHistory: updatedHistory,
      updatedAt: new Date(),
    });
  }

  /**
   * 根据 ID 查询账户详细信息
   * @param id 账户 ID
   * @returns 账户详细信息
   */
  async findOneById(id: number): Promise<AccountEntity> {
    const account = await this.accountRepository.findOne({
      where: { id },
    });

    if (!account) {
      throw new Error('账户不存在');
    }

    return account;
  }
}
