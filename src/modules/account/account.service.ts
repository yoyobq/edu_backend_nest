// src/modules/account/account.service.ts

import { UserAccountDTO } from '@adapters/graphql/account/dto/user-account.dto';
import { LoginHistoryItem } from '@adapters/graphql/account/enums/login-history.types';
import { AccountWithAccessGroup, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors/domain-error';
import { PasswordPbkdf2Helper } from '@core/common/password/password.pbkdf2.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CoachEntity } from './entities/account-coach.entity';
import { ManagerEntity } from './entities/account-manager.entity';
import { StaffEntity } from './entities/account-staff.entity';
import { AccountEntity } from './entities/account.entity';
import { UserInfoEntity } from './entities/user-info.entity';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserInfoEntity)
    private readonly userInfoRepository: Repository<UserInfoEntity>,
    @InjectRepository(StaffEntity)
    private readonly staffRepository: Repository<StaffEntity>,
    @InjectRepository(CoachEntity)
    private readonly coachRepository: Repository<CoachEntity>,
    @InjectRepository(ManagerEntity)
    private readonly managerRepository: Repository<ManagerEntity>,
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

  /**
   * 根据账户 ID 查找员工信息
   * @param accountId 账户 ID
   * @returns 员工信息或 null
   */
  async findStaffByAccountId(accountId: number): Promise<StaffEntity | null> {
    return await this.staffRepository.findOne({
      where: { accountId },
    });
  }

  /**
   * 根据账户 ID 查找教练信息
   * @param accountId 账户 ID
   * @returns 教练信息或 null
   */
  async findCoachByAccountId(accountId: number): Promise<CoachEntity | null> {
    return await this.coachRepository.findOne({
      where: { accountId },
    });
  }

  /**
   * 根据账户 ID 查找经理信息
   * @param accountId 账户 ID
   * @returns 经理信息或 null
   */
  async findManagerByAccountId(accountId: number): Promise<ManagerEntity | null> {
    return await this.managerRepository.findOne({
      where: { accountId },
    });
  }

  /**
   * 选择可用的昵称
   * 优先级：用户提供的昵称 > 备选选项 > 最终保底（'用户' + '#' + 随机字符串）
   * @param params 包含昵称处理所需参数的对象。
   * @param params.providedNickname 用户提供的昵称。
   * @param params.fallbackOptions 备选昵称的优先级列表，例如 [loginName, loginEmail]。
   * @returns 处理后的最终昵称，保证一定返回可用昵称。
   */
  /**
   * 选择可用的昵称
   * @param providedNickname 用户提供的昵称
   * @param fallbackOptions 备选昵称选项
   * @param provider 第三方平台类型，如果未提供则表示本站注册
   * @returns 可用的昵称，本站注册时如果无法生成则返回 undefined
   */
  async pickAvailableNickname({
    providedNickname,
    fallbackOptions = [],
    provider,
  }: {
    providedNickname?: string;
    fallbackOptions?: string[];
    provider?: ThirdPartyProviderEnum;
  }): Promise<string | undefined> {
    // 输入边界处理：清理和验证输入
    const cleanProvidedNickname = providedNickname?.trim() || undefined;
    const cleanFallbackOptions = fallbackOptions
      .map((option) => option?.trim())
      .filter((option) => option && option.length > 0);

    // 候选昵称列表，按优先级排序
    const candidates: string[] = [];

    // 1. 用户提供的昵称
    if (cleanProvidedNickname) {
      candidates.push(cleanProvidedNickname);
    }

    // 2. 备选选项
    for (const option of cleanFallbackOptions) {
      if (option) {
        // 如果是邮箱，取 @ 前面的部分
        const nickname = option.includes('@') ? option.split('@')[0] : option;
        if (nickname && nickname.length > 0) {
          candidates.push(nickname);
        }
      }
    }

    // 尝试每个候选昵称
    for (const candidate of candidates) {
      const exists = await this.checkNicknameExists(candidate);
      if (!exists) {
        return candidate;
      }

      // 如果昵称已存在，尝试添加随机后缀
      const uniqueNickname = await this.generateUniqueNicknameWithSuffix(candidate);
      if (uniqueNickname) {
        return uniqueNickname;
      }
    }

    // 如果未提供 provider，说明是本站注册，不使用保底逻辑，返回 undefined
    if (!provider) {
      return undefined;
    }

    // 第三方注册的保底逻辑：根据平台类型生成不同的默认昵称
    const fallbackBase = this.getFallbackNicknameByProvider(provider);
    const fallbackNickname = await this.generateUniqueNicknameWithSuffix(fallbackBase);
    if (fallbackNickname) {
      return fallbackNickname;
    }

    // 极端情况保底：如果连默认昵称都重复，直接生成一个更长的随机昵称
    const randomSuffix = this.generateRandomString(12);
    return `${fallbackBase}#${randomSuffix}`;
  }

  /**
   * 根据第三方平台类型获取保底昵称基础名称
   * @param provider 第三方平台类型
   * @returns 保底昵称基础名称
   */
  private getFallbackNicknameByProvider(provider: ThirdPartyProviderEnum): string {
    switch (provider) {
      case ThirdPartyProviderEnum.WEAPP:
        return '微信用户';
      case ThirdPartyProviderEnum.WECHAT:
        return '微信用户';
      case ThirdPartyProviderEnum.QQ:
        return 'QQ用户';
      case ThirdPartyProviderEnum.GOOGLE:
        return 'Google用户';
      case ThirdPartyProviderEnum.GITHUB:
        return 'GitHub用户';
      default:
        return '用户';
    }
  }

  /**
   * 为昵称添加随机后缀以生成唯一昵称
   * @param baseNickname 基础昵称
   * @returns 唯一昵称，如果多次尝试都失败则返回 undefined
   */
  private async generateUniqueNicknameWithSuffix(
    baseNickname: string,
  ): Promise<string | undefined> {
    const maxAttempts = 5; // 最多尝试 5 次

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomSuffix = this.generateRandomString(6);
      const uniqueNickname = `${baseNickname}#${randomSuffix}`;

      const uniqueExists = await this.checkNicknameExists(uniqueNickname);
      if (!uniqueExists) {
        return uniqueNickname;
      }
    }

    // 如果多次尝试都失败，返回 undefined
    return undefined;
  }

  /**
   * 生成指定长度的随机字符串
   * @param length 字符串长度
   * @returns 随机字符串
   */
  private generateRandomString(length: number): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  }
}
