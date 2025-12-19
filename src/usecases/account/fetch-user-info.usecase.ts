// src/usecases/account/fetch-user-info.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types'; // 导入统一的 UserInfoView
import { Gender, UserState } from '@app-types/models/user-info.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors';
import { UserInfoEntity } from '@modules/account/base/entities/user-info.entity';
import { AccountSecurityService } from '@modules/account/base/services/account-security.service';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';

// 移除本地的 UserInfoView 定义，使用统一的类型定义

/**
 * 完整的用户数据（包含安全验证结果）
 * 用于登录流程中的数据传递和安全比对
 */
export interface CompleteUserData {
  userInfoView: UserInfoView;
  securityResult: {
    isValid: boolean;
    wasSuspended: boolean;
    realAccessGroup?: IdentityTypeEnum[];
  };
  rawUserInfo: UserInfoEntity | null;
}

@Injectable()
export class FetchUserInfoUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly accountSecurityService: AccountSecurityService,
  ) {}

  /**
   * 登录场景：允许 user_info 不存在，提供兜底值
   * - accessGroup 可选：外部若已计算可透传；未提供则在本用例内计算（避免多真相源）
   */
  // 移除 executeStrict 方法，因为 UserInfoView 现在本身就是严格类型
  // async executeStrict(...) 方法可以删除

  /**
   * 获取用户信息（登录专用）
   * 确保返回完整的用户信息，所有必要字段都有值
   */
  async executeForLogin(params: {
    accountId: number;
    accessGroup?: IdentityTypeEnum[];
  }): Promise<UserInfoView> {
    const base = await this.accountService.findUserInfoByAccountId(params.accountId);
    const finalAccessGroup: IdentityTypeEnum[] = base?.accessGroup
      ? base.accessGroup
      : [IdentityTypeEnum.REGISTRANT];

    return this.buildUserInfoView(base, params.accountId, finalAccessGroup);
  }

  /**
   * 严格模式：必须存在 user_info，否则抛错
   * - 适用于资料管理页等强一致场景
   * - accessGroup 可选：同上
   */
  async executeStrict(params: {
    accountId: number;
    accessGroup?: IdentityTypeEnum[];
    manager?: import('typeorm').EntityManager;
  }): Promise<
    UserInfoView & {
      nickname: string;
      userState: UserState;
      notifyCount: number;
      unreadCount: number;
      createdAt: Date;
      updatedAt: Date;
    }
  > {
    const { accountId } = params;

    const base = await this.accountService.findUserInfoByAccountId(accountId, params.manager);
    if (!base) {
      throw new DomainError(
        ACCOUNT_ERROR.USER_INFO_NOT_FOUND,
        `账户 ID ${accountId} 对应的用户信息不存在，无法完成操作`,
      );
    }

    const finalAccessGroup: IdentityTypeEnum[] = base.accessGroup?.length
      ? base.accessGroup
      : [IdentityTypeEnum.REGISTRANT];

    return this.buildUserInfoView(base, accountId, finalAccessGroup) as UserInfoView & {
      nickname: string;
      userState: UserState;
      notifyCount: number;
      unreadCount: number;
      createdAt: Date;
      updatedAt: Date;
    };
  }

  /**
   * 登录流程专用：获取完整用户数据并执行安全验证
   * - 包含 metaDigest 与 accessGroup 的一致性检查
   * - 返回验证后的真实 accessGroup
   * - 用于三步登录流程的统一数据获取
   */
  async executeForLoginFlow(params: { accountId: number }): Promise<CompleteUserData> {
    const { accountId } = params;

    // 1. 获取账户信息
    const account = await this.accountService.findOneById(accountId);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    // 2. 获取用户详细信息
    const userInfo = await this.accountService.findUserInfoByAccountId(accountId);
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    // 3. 执行安全验证（metaDigest 与 accessGroup 比对）
    const securityResult = this.accountSecurityService.checkAndHandleAccountSecurity({
      ...account,
      userInfo,
    });

    // 4. 如果账号被暂停，抛出错误
    if (securityResult.wasSuspended) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_SUSPENDED, '账户因安全问题已被暂停');
    }

    // 5. 确定最终的 accessGroup（严格使用数据库字段）
    const finalAccessGroup: IdentityTypeEnum[] = userInfo.accessGroup ?? [
      IdentityTypeEnum.REGISTRANT,
    ];

    // 6. 构建用户信息视图
    const userInfoView = this.buildUserInfoView(userInfo, accountId, finalAccessGroup);

    return {
      userInfoView,
      securityResult,
      rawUserInfo: userInfo,
    };
  }

  /**
   * 构建用户信息视图对象（统一映射与兜底策略）
   */
  private buildUserInfoView(
    base: UserInfoEntity | null,
    accountId: number,
    accessGroup: IdentityTypeEnum[],
  ): UserInfoView {
    return {
      accountId,
      accessGroup, // 单一真相源：要么用外部透传，要么本用例计算
      ...this.buildBasicFields(base),
      ...this.buildContactFields(base),
      ...this.buildExtendedFields(base),
      ...this.buildSystemFields(base),
    };
  }

  /** 基本信息 */
  private buildBasicFields(base: UserInfoEntity | null) {
    return {
      nickname: base?.nickname ?? '', // 改为非空，提供默认值
      gender: base?.gender ?? Gender.SECRET, // 改为非空，提供默认值
      birthDate: base?.birthDate ?? null,
      avatarUrl: base?.avatarUrl ?? null,
      signature: base?.signature ?? null,
    };
  }

  /** 联系方式 */
  private buildContactFields(base: UserInfoEntity | null) {
    return {
      email: base?.email ?? null,
      address: base?.address ?? null,
      phone: base?.phone ?? null,
    };
  }

  /** 扩展信息（JSON 字段等） */
  private buildExtendedFields(base: UserInfoEntity | null) {
    return {
      tags: this.normalizeTags(base?.tags),
      geographic: base?.geographic ?? null,
      metaDigest: base?.metaDigest ?? null, // 添加 metaDigest 字段
    };
  }

  /** 系统字段/状态 */
  private buildSystemFields(base: UserInfoEntity | null) {
    return {
      // 这些字段现在都是非空的，始终提供默认值
      notifyCount: base?.notifyCount ?? 0,
      unreadCount: base?.unreadCount ?? 0,
      userState: base?.userState ?? UserState.PENDING,
      createdAt: base?.createdAt ?? new Date(), // 改为非空，提供默认值
      updatedAt: base?.updatedAt ?? new Date(), // 改为非空，提供默认值
    };
  }

  /** tags 兜底：只能是字符串数组；否则返回 null */
  private normalizeTags(tags: unknown): string[] | null {
    if (!tags) return null;
    if (Array.isArray(tags)) return tags.map((v) => String(v));
    return null;
  }
}
export { UserInfoView };
