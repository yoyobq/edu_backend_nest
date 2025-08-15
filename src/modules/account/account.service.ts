// src/modules/account/account.service.ts

import { LoginHistoryItem } from '@adapters/graphql/account/enums/login-history.types';
import { AccountStatus, AccountWithAccessGroup } from '@app-types/models/account.types';
import { PasswordPbkdf2Helper } from '@core/common/password/password.pbkdf2.helper';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthLoginInput } from '@src/adapters/graphql/auth/dto/auth-login.input';
import { Repository } from 'typeorm';
import { AccountEntity } from './entities/account.entity';
import { UserInfoEntity } from './entities/user-info.entity';

/**
 * 账户服务
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
   * 验证用户登录信息
   * @param args 登录参数
   * @returns 验证通过的账户信息
   * @throws 验证失败时抛出错误
   */
  async validateLogin({
    loginName,
    loginPassword,
  }: Pick<AuthLoginInput, 'loginName' | 'loginPassword'>): Promise<AccountEntity> {
    // 根据登录名或邮箱查找账户，需要包含 createdAt 字段用于生成 salt
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

    // 使用 createdAt 作为 salt 进行密码验证
    const salt = account.createdAt.toString();
    const hashedInputPassword = PasswordPbkdf2Helper.hashPasswordWithCrypto(loginPassword, salt);

    // 验证密码哈希是否匹配
    if (account.loginPassword !== hashedInputPassword) {
      throw new Error('密码错误');
    }

    return account;
  }

  /**
   * 获取用户完整信息（包括 accessGroup）
   * @param accountId 账户 ID
   * @returns 包含用户详细信息的账户数据
   * @throws 用户不存在时抛出错误
   */
  async getUserWithAccessGroup({
    accountId,
  }: {
    accountId: number;
  }): Promise<AccountWithAccessGroup> {
    // 查询账户基本信息
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['id', 'loginName', 'loginEmail'],
    });

    if (!account) {
      throw new UnauthorizedException('账户不存在');
    }

    // 查询用户详细信息获取 accessGroup
    const userInfo = await this.userInfoRepository.findOne({
      where: { accountId },
      select: ['accessGroup'],
    });

    return {
      id: account.id,
      loginName: account.loginName || '',
      loginEmail: account.loginEmail || '',
      accessGroup: userInfo?.accessGroup || ['guest'],
    };
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

  /**
   * 检查账户是否已存在（根据登录名或邮箱）
   * @param loginName 登录名
   * @param loginEmail 登录邮箱
   * @returns 如果账户存在返回 true，否则返回 false
   */
  async checkAccountExists({
    loginName = null,
    loginEmail, // 移除默认值，因为现在总是提供
  }: {
    loginName?: string | null;
    loginEmail: string; // 改为必需
  }): Promise<boolean> {
    const queryBuilder = this.accountRepository.createQueryBuilder('account');

    if (loginName) {
      queryBuilder.where('account.loginName = :loginName OR account.loginEmail = :loginEmail', {
        loginName,
        loginEmail,
      });
    } else {
      queryBuilder.where('account.loginEmail = :loginEmail', { loginEmail });
    }

    const existingAccount = await queryBuilder.getOne();
    return !!existingAccount;
  }

  /**
   * 检查昵称是否已存在
   * @param nickname 昵称
   * @returns 是否存在
   */
  async checkNicknameExists(nickname: string): Promise<boolean> {
    const existingUserInfo = await this.userInfoRepository.findOne({
      where: { nickname },
    });
    return !!existingUserInfo;
  }

  /**
   * 创建新账户（包含账户和用户信息）
   * @param accountData 账户基本信息
   * @param userInfoData 用户详细信息
   * @returns 创建的账户实体
   */
  async createAccount(
    accountData: Partial<AccountEntity>,
    userInfoData: Partial<UserInfoEntity>,
  ): Promise<AccountEntity> {
    // 使用事务确保数据一致性
    return await this.accountRepository.manager.transaction(async (manager) => {
      // 先创建账户，给密码一个临时值
      const account = manager.create(AccountEntity, {
        ...accountData,
        loginPassword: 'TEMP_PASSWORD', // 临时密码值
      });
      const savedAccount = await manager.save(account);

      // 使用 created_at 作为盐值加密密码
      const salt = savedAccount.createdAt.toString();
      const hashedPassword = PasswordPbkdf2Helper.hashPasswordWithCrypto(
        accountData.loginPassword as string,
        salt,
      );

      // 更新账户密码
      savedAccount.loginPassword = hashedPassword;
      savedAccount.status = AccountStatus.ACTIVE;
      await manager.save(savedAccount);

      // 创建用户信息
      const userInfo = manager.create(UserInfoEntity, {
        ...userInfoData,
        accountId: savedAccount.id,
      });
      await manager.save(userInfo);

      return savedAccount;
    });
  }
}
