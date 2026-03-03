// src/modules/account/base/services/account.service.ts

import {
  AccountStatus,
  AccountWithAccessGroup,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginHistoryItem,
  ThirdPartyProviderEnum,
  UserAccountView,
} from '@app-types/models/account.types';
import { Gender, type GeographicInfo, UserState } from '@app-types/models/user-info.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors/domain-error';
import { normalizeEmail } from '@core/common/normalize/normalize.helper';
import { LegacyPasswordCryptoHelper } from '@modules/common/password/legacy-password-crypto.helper';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

// ✅ base 层实体（始终存在）
import { AccountEntity } from '../entities/account.entity';
import { UserInfoEntity } from '../entities/user-info.entity';

import { AccountSecurityService } from './account-security.service';

// ✅ 可插拔 provider 的聚合 Map（identity → provider）
import { PROFILE_PROVIDER_MAP_TOKEN } from '../constants/provider-tokens';
import type { AccountProfileProvider } from '../interfaces/account-profile-provider.interface';

// ✅ 仅类型用途：不同 identity 对应的实体类型（不会引入运行时依赖）
import type { StaffEntity } from '../../identities/school/staff/account-staff.entity';
import type { StudentEntity } from '../../identities/school/student/account-student.entity';
import type { CoachEntity } from '../../identities/training/coach/account-coach.entity';
import type { CustomerEntity } from '../../identities/training/customer/account-customer.entity';
import type { LearnerEntity } from '../../identities/training/learner/account-learner.entity';
import type { ManagerEntity } from '../../identities/training/manager/account-manager.entity';

export type AccountTransactionManager = EntityManager;

export interface AccountCreateData {
  loginName?: string | null;
  loginEmail?: string | null;
  loginPassword?: string;
  status?: AccountStatus;
  audience?: AudienceTypeEnum;
  identityHint?: string | null;
  recentLoginHistory?: LoginHistoryItem[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserInfoCreateData {
  accountId?: number;
  nickname?: string;
  gender?: Gender;
  birthDate?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  signature?: string | null;
  accessGroup?: IdentityTypeEnum[];
  address?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  geographic?: GeographicInfo | null;
  metaDigest?: IdentityTypeEnum[] | null;
  notifyCount?: number;
  unreadCount?: number;
  userState?: UserState;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 将身份常量映射到该身份的 Profile 实体类型
 * - 仅用于类型层面，让调用更安全（findStaffByAccountId 返回 StaffEntity | null 等）
 * - 不会影响运行时
 */
type IdentityToEntity = {
  STAFF: StaffEntity;
  STUDENT: StudentEntity;
  COACH: CoachEntity;
  MANAGER: ManagerEntity;
  CUSTOMER: CustomerEntity;
  LEARNER: LearnerEntity;
};

@Injectable()
export class AccountService {
  constructor(
    // private readonly passwordHelper: PasswordPbkdf2Helper, // 移除这行
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserInfoEntity)
    private readonly userInfoRepository: Repository<UserInfoEntity>,
    private readonly accountSecurityService: AccountSecurityService,
    @Inject(PROFILE_PROVIDER_MAP_TOKEN)
    private readonly providerMap: Map<string, AccountProfileProvider<unknown>>,
  ) {}

  // =========================================================
  // 🔧 Provider 访问辅助（修复 TS2322 的关键）
  // =========================================================

  /**
   * 从聚合 Map 中按身份取出 Provider，并在类型层面绑定到该身份对应的实体类型。
   *
   * 说明：
   * - providerMap 的值是 AccountProfileProvider<unknown>
   * - 我们需要把它“收窄”为 AccountProfileProvider<具体实体类型>
   * - TypeScript 无法证明这点，只能使用“双重断言（unknown → 目标类型）”
   * - 这是本设计中的“可信契约假设”：每个身份包注册的 provider 与该身份的实体匹配
   */
  private getProviderByIdentity<K extends keyof IdentityToEntity>(
    identity: K,
  ): AccountProfileProvider<IdentityToEntity[K]> | undefined {
    const p = this.providerMap.get(identity as string);
    // 双重断言解释：
    //  1) 先把值当成 unknown（与实际 Map 中的 unknown 对齐）
    //  2) 再断言成期望的具体类型 AccountProfileProvider<IdentityToEntity[K]>
    // 这样可避免 TS2322（unknown → 泛型参数 T）报错
    return p as unknown as AccountProfileProvider<IdentityToEntity[K]> | undefined;
  }

  // =========================================================
  // 登录历史 & 账户/用户信息（原样保留）
  // =========================================================

  /** 记录用户登录历史：保留最近 5 条（新记录 + 旧 4 条） */
  async recordLoginHistory(
    accountId: number,
    timestamp: string,
    ip?: string,
    audience?: string,
  ): Promise<void> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: ['recentLoginHistory'],
    });

    const newHistoryItem: LoginHistoryItem = { ip: ip || '', timestamp, audience };
    const existingHistory = account?.recentLoginHistory || [];
    const updatedHistory: LoginHistoryItem[] = [newHistoryItem, ...existingHistory.slice(0, 4)];

    await this.accountRepository.update(accountId, {
      recentLoginHistory: updatedHistory,
      updatedAt: new Date(),
    });
  }

  /** 根据 ID 查询账户 */
  async findOneById(id: number, manager?: EntityManager): Promise<AccountEntity | null> {
    const repository = manager ? manager.getRepository(AccountEntity) : this.accountRepository;
    return await repository.findOne({ where: { id } });
  }

  /** 根据登录名或邮箱查询账户 */
  async findByLoginName(loginName: string): Promise<AccountEntity | null> {
    const normalizedLoginName = normalizeEmail(loginName);
    return await this.accountRepository
      .createQueryBuilder('account')
      .where('account.loginName = :loginName', { loginName })
      .orWhere('account.loginEmail = :loginEmail', { loginEmail: normalizedLoginName })
      .getOne();
  }

  /** 根据邮箱查找账户 */
  async findByEmail(loginEmail: string): Promise<AccountEntity | null> {
    const normalizedEmail = normalizeEmail(loginEmail);
    return await this.accountRepository.findOne({ where: { loginEmail: normalizedEmail } });
  }

  /** 精确匹配登录名 */
  async findByName(loginName: string): Promise<AccountEntity | null> {
    return await this.accountRepository.findOne({ where: { loginName } });
  }

  /** 根据账户 ID 查找用户信息（带 account 关系） */
  async findUserInfoByAccountId(
    accountId: number,
    manager?: EntityManager,
  ): Promise<UserInfoEntity | null> {
    const repository = manager ? manager.getRepository(UserInfoEntity) : this.userInfoRepository;
    return await repository.findOne({
      where: { accountId },
      relations: ['account'],
    });
  }

  /** 根据昵称查找用户信息 */
  async findUserInfoByNickname(nickname: string): Promise<UserInfoEntity | null> {
    return await this.userInfoRepository.findOne({ where: { nickname } });
  }

  /** 创建账户实体（不落库） */
  createAccountEntity(params: {
    accountData: AccountCreateData;
    manager?: EntityManager;
  }): AccountEntity {
    const { accountData, manager } = params;
    const repository = manager ? manager.getRepository(AccountEntity) : this.accountRepository;
    return repository.create(accountData);
  }

  /** 落库账户实体 */
  async saveAccount(params: {
    account: AccountEntity;
    manager?: EntityManager;
  }): Promise<AccountEntity> {
    const { account, manager } = params;
    const repository = manager ? manager.getRepository(AccountEntity) : this.accountRepository;
    return await repository.save(account);
  }

  /** 更新账户 */
  async updateAccount(
    id: number,
    updateData: Partial<AccountEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(AccountEntity) : this.accountRepository;
    await repository.update(id, updateData);
  }

  /**
   * 显式锁定账户以避免并发覆盖
   * @param accountId 账户 ID
   * @param manager 事务管理器
   * @returns 锁定的账户实体
   */
  async lockByIdForUpdate(accountId: number, manager: EntityManager): Promise<AccountEntity> {
    const repository = manager.getRepository(AccountEntity);
    const account = await repository
      .createQueryBuilder('account')
      .where('account.id = :accountId', { accountId })
      .setLock('pessimistic_write')
      .getOne();

    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    return account;
  }

  /** 创建用户信息实体（不落库） */
  createUserInfoEntity(params: {
    userInfoData: UserInfoCreateData;
    manager?: EntityManager;
  }): UserInfoEntity {
    const { userInfoData, manager } = params;
    const repository = manager ? manager.getRepository(UserInfoEntity) : this.userInfoRepository;
    return repository.create(userInfoData);
  }

  /** 落库用户信息实体 */
  async saveUserInfo(params: {
    userInfo: UserInfoEntity;
    manager?: EntityManager;
  }): Promise<UserInfoEntity> {
    const { userInfo, manager } = params;
    const repository = manager ? manager.getRepository(UserInfoEntity) : this.userInfoRepository;
    return await repository.save(userInfo);
  }

  /**
   * 更新用户 accessGroup 并同步 metaDigest
   */
  async updateUserInfoAccessGroup(params: {
    accountId: number;
    accessGroup: IdentityTypeEnum[];
    manager: EntityManager;
  }): Promise<{ isUpdated: boolean }> {
    const { accountId, accessGroup, manager } = params;
    const repository = manager.getRepository(UserInfoEntity);
    const userInfo = await repository.findOne({ where: { accountId } });
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const current = userInfo.accessGroup ?? [];
    const isSame =
      current.length === accessGroup.length && current.every((v, i) => v === accessGroup[i]);
    if (isSame) {
      return { isUpdated: false };
    }

    userInfo.accessGroup = accessGroup;
    userInfo.metaDigest = accessGroup;
    userInfo.updatedAt = new Date();
    await repository.save(userInfo);
    return { isUpdated: true };
  }

  /** 事务执行（使用 AccountEntity 的 manager） */
  async runTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return await this.accountRepository.manager.transaction(callback);
  }

  // =========================================================
  // 密码工具（原样保留）
  // =========================================================

  /** 使用创建时间作为盐值进行 PBKDF2 加密 */
  static hashPasswordWithTimestamp(password: string, createdAt: Date): string {
    // 应用与 PasswordPolicyService 相同的预处理
    const processedPassword = AccountService.preprocessPassword(password);
    const salt = createdAt.toString();
    return LegacyPasswordCryptoHelper.hashPasswordWithCrypto(processedPassword, salt);
  }

  /** 验证密码 */
  static verifyPassword(password: string, hashedPassword: string, createdAt: Date): boolean {
    // 应用与 PasswordPolicyService 相同的预处理
    const processedPassword = AccountService.preprocessPassword(password);
    const salt = createdAt.toString();
    return LegacyPasswordCryptoHelper.verifyPasswordWithCrypto(
      processedPassword,
      salt,
      hashedPassword,
    );
  }

  /**
   * 密码预处理 - 与 PasswordPolicyService 保持一致
   * @param password 原始密码
   * @returns 预处理后的密码
   */
  private static preprocessPassword(password: string): string {
    // 检查空白密码
    if (!password || !password.trim()) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码不能为空或纯空白字符');
    }

    // NFKC 规范化处理
    const normalizedPassword = password.normalize('NFKC');

    // 检查首尾空格
    if (normalizedPassword !== normalizedPassword.trim()) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码首尾不能包含空格');
    }

    return normalizedPassword;
  }

  // =========================================================
  // 唯一性检查（原样保留）
  // =========================================================

  /** 检查账户是否存在（邮箱必传，登录名可选） */
  async checkAccountExists({
    loginName,
    loginEmail,
  }: {
    loginName?: string | null;
    loginEmail: string;
  }): Promise<boolean> {
    const accountByEmail = await this.findByEmail(loginEmail);
    if (accountByEmail) return true;

    if (loginName) {
      const accountByName = await this.findByName(loginName);
      if (accountByName) return true;
    }
    return false;
  }

  /** 检查昵称是否存在 */
  async checkNicknameExists(nickname: string): Promise<boolean> {
    const userInfo = await this.findUserInfoByNickname(nickname);
    return !!userInfo;
  }

  // =========================================================
  // DTO 映射（原样保留）
  // =========================================================

  /** 根据 ID 获取账户详细信息（DTO） */
  async getAccountById(accountId: number): Promise<UserAccountView> {
    const account = await this.findOneById(accountId);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    return this.toUserAccountView(account);
  }

  toUserAccountView(account: AccountEntity): UserAccountView {
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

  /** 获取用户 + accessGroup */
  async getUserWithAccessGroup(accountId: number): Promise<AccountWithAccessGroup> {
    const account = await this.findOneById(accountId);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    const userInfo = await this.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 检查账户安全性
    const securityResult = this.accountSecurityService.checkAndHandleAccountSecurity({
      ...account,
      userInfo,
    });

    // 如果账号被暂停，抛出错误
    if (securityResult.wasSuspended) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_SUSPENDED, '账户因安全问题已被暂停');
    }

    // 返回数据库中的 accessGroup（已通过安全校验阻断不一致场景）
    const accessGroup: IdentityTypeEnum[] =
      userInfo.accessGroup && userInfo.accessGroup.length > 0
        ? userInfo.accessGroup
        : [IdentityTypeEnum.REGISTRANT];

    return {
      id: account.id,
      loginName: account.loginName || '',
      loginEmail: account.loginEmail || '',
      accessGroup,
    };
  }

  // =========================================================
  // 🔁 身份相关查询（通过 Provider 分发）
  // =========================================================

  /** 根据账户 ID 查找员工（Staff）信息（未启用 staff 包时返回 null） */
  async findStaffByAccountId(accountId: number): Promise<StaffEntity | null> {
    const provider = this.getProviderByIdentity('STAFF');
    if (!provider) return null;
    return await provider.getProfile(accountId);
  }

  /** 根据账户 ID 查找教练（Coach）信息（未启用 coach 包时返回 null） */
  async findCoachByAccountId(accountId: number): Promise<CoachEntity | null> {
    const provider = this.getProviderByIdentity('COACH');
    if (!provider) return null;
    return await provider.getProfile(accountId);
  }

  /** 根据账户 ID 查找经理（Manager）信息（未启用 manager 包时返回 null） */
  async findManagerByAccountId(accountId: number): Promise<ManagerEntity | null> {
    const provider = this.getProviderByIdentity('MANAGER');
    if (!provider) return null;
    return await provider.getProfile(accountId);
  }

  /** 根据账户 ID 查找客户（Customer）信息（未启用 customer 包时返回 null） */
  async findCustomerByAccountId(accountId: number): Promise<CustomerEntity | null> {
    const provider = this.getProviderByIdentity('CUSTOMER');
    if (!provider) return null;
    return await provider.getProfile(accountId);
  }

  /** 根据账户 ID 查找学员（Learner）信息（未启用 learner 包时返回 null） */
  async findLearnerByAccountId(accountId: number): Promise<LearnerEntity | null> {
    const provider = this.getProviderByIdentity('LEARNER');
    if (!provider) return null;
    return await provider.getProfile(accountId);
  }

  /** 批量根据账户 ID 查找学员信息 */
  async findLearnersByAccountIds(accountIds: number[]): Promise<Map<number, LearnerEntity>> {
    const provider = this.getProviderByIdentity('LEARNER');
    if (!provider || !provider.getProfiles) return new Map();
    return await provider.getProfiles(accountIds);
  }

  // =========================================================
  // 昵称挑选（原样保留）
  // =========================================================

  /**
   * 选择可用昵称：
   * 1) 尝试用户提供
   * 2) 尝试备选（loginName / loginEmail 前缀）
   * 3) 冲突则附加随机后缀
   * 4) 第三方注册有保底前缀（微信用户/Google用户等）
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
    const cleanProvidedNickname = providedNickname?.trim() || undefined;
    const cleanFallbackOptions = fallbackOptions
      .map((o) => o?.trim())
      .filter((o): o is string => !!o && o.length > 0);

    const candidates: string[] = [];
    if (cleanProvidedNickname) candidates.push(cleanProvidedNickname);

    for (const option of cleanFallbackOptions) {
      const nickname = option.includes('@') ? option.split('@')[0] : option;
      if (nickname) candidates.push(nickname);
    }

    for (const candidate of candidates) {
      const exists = await this.checkNicknameExists(candidate);
      if (!exists) return candidate;

      const uniqueNickname = await this.generateUniqueNicknameWithSuffix(candidate);
      if (uniqueNickname) return uniqueNickname;
    }

    if (!provider) return undefined;

    const fallbackBase = this.getFallbackNicknameByProvider(provider);
    const fallbackNickname = await this.generateUniqueNicknameWithSuffix(fallbackBase);
    if (fallbackNickname) return fallbackNickname;

    const randomSuffix = this.generateRandomString(12);
    return `${fallbackBase}#${randomSuffix}`;
  }

  /** 第三方平台默认昵称前缀 */
  private getFallbackNicknameByProvider(provider: ThirdPartyProviderEnum): string {
    switch (provider) {
      case ThirdPartyProviderEnum.WEAPP:
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

  /** 在基础昵称上添加随机后缀，最多尝试 5 次 */
  private async generateUniqueNicknameWithSuffix(
    baseNickname: string,
  ): Promise<string | undefined> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomSuffix = this.generateRandomString(6);
      const uniqueNickname = `${baseNickname}#${randomSuffix}`;
      const exists = await this.checkNicknameExists(uniqueNickname);
      if (!exists) return uniqueNickname;
    }
    return undefined;
  }

  /** 生成指定长度的随机字符串（a-z0-9） */
  private generateRandomString(length: number): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  }
}
