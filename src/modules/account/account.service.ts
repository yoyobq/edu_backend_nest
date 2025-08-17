// src/modules/account/account.service.ts

import { LoginHistoryItem } from '@adapters/graphql/account/enums/login-history.types';
import { PasswordPbkdf2Helper } from '@core/common/password/password.pbkdf2.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountEntity } from './entities/account.entity';
import { UserInfoEntity } from './entities/user-info.entity';
import { UserAccountDTO } from '../../adapters/graphql/account/dto/user-account.dto';
import { AccountWithAccessGroup } from '../../types/models/account.types';
import { DomainError, ACCOUNT_ERROR } from '../../core/common/errors/domain-error';

/**
 * 账户服务 - 提供账户相关的技术实现
 */
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserInfoEntity)
    private readonly userInfoRepository: Repository<UserInfoEntity>,
  ) {}

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
  async findOneById(id: number): Promise<AccountEntity | null> {
    return await this.accountRepository.findOne({
      where: { id },
    });
  }

  /**
   * 根据登录名查找账户（支持登录名或邮箱）
   * @param loginName 登录名或邮箱
   * @returns 账户信息或 null
   */
  async findByLoginName(loginName: string): Promise<AccountEntity | null> {
    return await this.accountRepository
      .createQueryBuilder('account')
      .where('account.loginName = :loginName', { loginName })
      .orWhere('account.loginEmail = :loginEmail', { loginEmail: loginName })
      .getOne();
  }

  /**
   * 根据邮箱查找账户
   * @param loginEmail 登录邮箱
   * @returns 账户信息或 null
   */
  async findByEmail(loginEmail: string): Promise<AccountEntity | null> {
    return await this.accountRepository.findOne({
      where: { loginEmail },
    });
  }

  /**
   * 根据登录名查找账户（精确匹配登录名）
   * @param loginName 登录名
   * @returns 账户信息或 null
   */
  async findByName(loginName: string): Promise<AccountEntity | null> {
    return await this.accountRepository.findOne({
      where: { loginName },
    });
  }

  /**
   * 根据账户 ID 查找用户信息
   * @param accountId 账户 ID
   * @returns 用户信息或 null
   */
  async findUserInfoByAccountId(accountId: number): Promise<UserInfoEntity | null> {
    return await this.userInfoRepository.findOne({
      where: { accountId },
      relations: ['account'],
    });
  }

  /**
   * 根据昵称查找用户信息
   * @param nickname 昵称
   * @returns 用户信息或 null
   */
  async findUserInfoByNickname(nickname: string): Promise<UserInfoEntity | null> {
    return await this.userInfoRepository.findOne({
      where: { nickname },
    });
  }

  /**
   * 创建账户实体（不保存到数据库）
   * @param accountData 账户数据
   * @returns 账户实体
   */
  createAccountEntity(accountData: Partial<AccountEntity>): AccountEntity {
    return this.accountRepository.create(accountData);
  }

  /**
   * 保存账户实体到数据库
   * @param account 账户实体
   * @returns 保存后的账户实体
   */
  async saveAccount(account: AccountEntity): Promise<AccountEntity> {
    return await this.accountRepository.save(account);
  }

  /**
   * 更新账户信息
   * @param id 账户 ID
   * @param updateData 更新数据
   */
  async updateAccount(id: number, updateData: Partial<AccountEntity>): Promise<void> {
    await this.accountRepository.update(id, updateData);
  }

  /**
   * 创建用户信息实体（不保存到数据库）
   * @param userInfoData 用户信息数据
   * @returns 用户信息实体
   */
  createUserInfoEntity(userInfoData: Partial<UserInfoEntity>): UserInfoEntity {
    return this.userInfoRepository.create(userInfoData);
  }

  /**
   * 保存用户信息实体到数据库
   * @param userInfo 用户信息实体
   * @returns 保存后的用户信息实体
   */
  async saveUserInfo(userInfo: UserInfoEntity): Promise<UserInfoEntity> {
    return await this.userInfoRepository.save(userInfo);
  }

  /**
   * 执行数据库事务
   * @param callback 事务回调函数
   * @returns 事务执行结果
   */
  async runTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return await this.accountRepository.manager.transaction(callback);
  }

  /**
   * 使用时间戳作为盐值加密密码
   * @param password 原始密码
   * @param createdAt 创建时间
   * @returns 加密后的密码
   */
  static hashPasswordWithTimestamp(password: string, createdAt: Date): string {
    const salt = createdAt.toString();
    return PasswordPbkdf2Helper.hashPasswordWithCrypto(password, salt);
  }

  /**
   * 验证密码是否匹配
   * @param inputPassword 输入的密码
   * @param hashedPassword 存储的加密密码
   * @param createdAt 账户创建时间（用作盐值）
   * @returns 是否匹配
   */
  static verifyPassword(inputPassword: string, hashedPassword: string, createdAt: Date): boolean {
    const hashedInputPassword = this.hashPasswordWithTimestamp(inputPassword, createdAt);
    return hashedInputPassword === hashedPassword;
  }

  /**
   * 检查账户是否存在
   * @param params 检查参数
   * @returns 账户是否存在
   */
  async checkAccountExists({
    loginName,
    loginEmail,
  }: {
    loginName?: string | null;
    loginEmail: string;
  }): Promise<boolean> {
    // 检查邮箱是否存在
    const accountByEmail = await this.findByEmail(loginEmail);
    if (accountByEmail) {
      return true;
    }

    // 如果提供了登录名，检查登录名是否存在
    if (loginName) {
      const accountByName = await this.findByName(loginName);
      if (accountByName) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查昵称是否存在
   * @param nickname 昵称
   * @returns 昵称是否存在
   */
  async checkNicknameExists(nickname: string): Promise<boolean> {
    const userInfo = await this.findUserInfoByNickname(nickname);
    return !!userInfo;
  }

  /**
   * 根据 ID 获取账户详细信息（包含 DTO 转换）
   * @param accountId 账户 ID
   * @returns 账户详细信息 DTO
   */
  async getAccountById(accountId: number): Promise<UserAccountDTO> {
    const account = await this.findOneById(accountId);

    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    return {
      id: account.id,
      loginName: account.loginName,
      loginEmail: account.loginEmail,
      status: account.status,
      identityHint: account.identityHint,
      recentLoginHistory: account.recentLoginHistory || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * 获取用户完整信息（包括 accessGroup）
   * @param accountId 账户 ID
   * @returns 包含用户详细信息的账户数据
   */
  async getUserWithAccessGroup(accountId: number): Promise<AccountWithAccessGroup> {
    const account = await this.findOneById(accountId);

    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    const userInfo = await this.findUserInfoByAccountId(accountId);

    return {
      id: account.id,
      loginName: account.loginName || '',
      loginEmail: account.loginEmail || '',
      accessGroup: userInfo?.accessGroup || ['guest'],
    };
  }
}
