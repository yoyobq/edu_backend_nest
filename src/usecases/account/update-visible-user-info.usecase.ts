// 文件位置：src/usecases/account/update-visible-user-info.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types';
import { Gender, UserState, type GeographicInfo } from '@app-types/models/user-info.types';
import { expandRoles, hasRole } from '@core/account/policy/role-access.policy';
import { canViewUserInfo } from '@core/account/policy/user-info-visibility.policy';
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { FetchUserInfoUsecase } from './fetch-user-info.usecase';

export type UserInfoPatch = {
  nickname?: string;
  gender?: Gender;
  birthDate?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  signature?: string | null;
  address?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  geographic?: GeographicInfo | null;
  userState?: UserState;
  notifyCount?: number;
  unreadCount?: number;
};

export interface UpdateVisibleUserInfoParams {
  session: UsecaseSession;
  targetAccountId: number;
  patch: UserInfoPatch;
}

export interface UpdateVisibleUserInfoResult {
  view: UserInfoView;
  isUpdated: boolean;
}

@Injectable()
export class UpdateVisibleUserInfoUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly fetchUserInfoUsecase: FetchUserInfoUsecase,
  ) {}

  /**
   * 执行按可见性更新用户信息
   * 规则：
   * - 权限沿用查看规则：能查看即可更新（ADMIN 全量；MANAGER / COACH 可更新 Coach / Customer / Learner；Customer 仅可更新名下 Learner；Learner 仅可更新自己）
   * - 字段白名单：仅允许更新基础与联系字段；禁止修改 accessGroup / metaDigest
   * - 幂等：无字段变更则直接返回当前视图
   */
  async execute(params: UpdateVisibleUserInfoParams): Promise<UpdateVisibleUserInfoResult> {
    const { session, targetAccountId } = params;
    const patch = params.patch ?? {};

    if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '非法的目标账户 ID');
    }

    const allowed = await this.isAllowedToUpdate(session, targetAccountId);
    if (!allowed) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限更新该用户信息');
    }

    // 事务编排：读取 → 校验 → 幂等 → 更新 → 回读视图
    const result = await this.accountService.runTransaction<UpdateVisibleUserInfoResult>(
      async (manager) => {
        const current = await this.accountService.findUserInfoByAccountId(targetAccountId, manager);
        if (!current) {
          throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
        }

        const isSelf = session.accountId === targetAccountId;
        const isManagerRole = expandRoles(session.roles).includes(IdentityTypeEnum.MANAGER);
        const isAdminRole = hasRole(session.roles, IdentityTypeEnum.ADMIN);
        const sanitized = await this.sanitizePatch(patch, current, {
          isManager: isManagerRole,
          isSelf,
          isAdmin: isAdminRole,
        });
        if (Object.keys(sanitized).length === 0) {
          const view = await this.fetchUserInfoUsecase.executeStrict({
            accountId: targetAccountId,
            manager,
          });
          return { view, isUpdated: false };
        }

        // 应用更新并保存
        this.applyPatchToEntity(current, sanitized);
        await manager.getRepository(UserInfoEntity).save(current);

        const view = await this.fetchUserInfoUsecase.executeStrict({
          accountId: targetAccountId,
          manager,
        });
        return { view, isUpdated: true };
      },
    );

    return result;
  }

  /**
   * 权限判定：沿用查看可见性策略
   */
  private async isAllowedToUpdate(
    session: UsecaseSession,
    targetAccountId: number,
  ): Promise<boolean> {
    const isSelf = session.accountId === targetAccountId;
    if (isSelf) return true;
    if (hasRole(session.roles, IdentityTypeEnum.ADMIN)) return true;

    const expanded = expandRoles(session.roles);
    const pureLearner = expanded.length === 1 && expanded[0] === IdentityTypeEnum.LEARNER;
    if (pureLearner) return false;

    const isCoachRole = expanded.includes(IdentityTypeEnum.COACH);
    const isManagerRole = expanded.includes(IdentityTypeEnum.MANAGER);
    const isCustomerRole = expanded.includes(IdentityTypeEnum.CUSTOMER);
    if (!isCoachRole && !isManagerRole && !isCustomerRole) return false;

    const [targetCoach, targetCust, targetLearner, meCustomer] = await this.fetchVisibilityFacts(
      session,
      targetAccountId,
      { isCoachRole, isManagerRole, isCustomerRole },
    );

    const facts = {
      isSelf,
      targetIsCoach: !!(targetCoach && !targetCoach.deactivatedAt),
      targetIsCustomer: !!(targetCust && !targetCust.deactivatedAt),
      targetIsLearner: !!(targetLearner && !targetLearner.deactivatedAt),
      customerOwnsTargetLearner:
        !!meCustomer && !!targetLearner && meCustomer.id === targetLearner.customerId,
    } as const;

    return canViewUserInfo(session.roles, facts);
  }

  /**
   * 查询可见性相关事实
   */
  private async fetchVisibilityFacts(
    session: UsecaseSession,
    targetAccountId: number,
    roles: { isCoachRole: boolean; isManagerRole: boolean; isCustomerRole: boolean },
  ): Promise<
    [
      Awaited<ReturnType<typeof this.accountService.findCoachByAccountId>> | undefined,
      Awaited<ReturnType<typeof this.accountService.findCustomerByAccountId>> | undefined,
      Awaited<ReturnType<typeof this.accountService.findLearnerByAccountId>> | undefined,
      Awaited<ReturnType<typeof this.accountService.findCustomerByAccountId>> | undefined,
    ]
  > {
    let targetCoach:
      | Awaited<ReturnType<typeof this.accountService.findCoachByAccountId>>
      | undefined;
    let targetCust:
      | Awaited<ReturnType<typeof this.accountService.findCustomerByAccountId>>
      | undefined;
    let targetLearner:
      | Awaited<ReturnType<typeof this.accountService.findLearnerByAccountId>>
      | undefined;
    let meCustomer:
      | Awaited<ReturnType<typeof this.accountService.findCustomerByAccountId>>
      | undefined;

    if (roles.isCoachRole || roles.isManagerRole) {
      [targetCoach, targetCust, targetLearner] = await Promise.all([
        this.accountService.findCoachByAccountId(targetAccountId),
        this.accountService.findCustomerByAccountId(targetAccountId),
        this.accountService.findLearnerByAccountId(targetAccountId),
      ]);
    } else if (roles.isCustomerRole) {
      targetLearner = await this.accountService.findLearnerByAccountId(targetAccountId);
    }

    if (roles.isCustomerRole) {
      meCustomer = await this.accountService.findCustomerByAccountId(session.accountId);
    }

    return [targetCoach, targetCust, targetLearner, meCustomer];
  }

  /**
   * 清洗并验证更新字段
   */
  /**
   * 清洗并验证更新字段（支持 isSelf / isManager 开关）
   * - manager 自改：允许更广的白名单（包含 userState）
   * - manager 改他人：仅允许极少字段（nickname / avatarUrl / phone）
   * - 非 manager：允许基础与联系白名单，不允许 userState
   */
  /**
   * 清洗并验证更新字段（支持 isSelf / isManager / isAdmin 开关）
   * - admin：允许除敏感系统字段外的全部白名单（等同于 manager 自改）
   * - manager 自改：允许更广的白名单（包含 userState/notifyCount/unreadCount）
   * - manager 改他人：仅允许极少字段（nickname / avatarUrl / phone）
   * - 非 manager：允许基础与联系白名单，不允许用户状态与计数
   */
  private async sanitizePatch(
    patch: UserInfoPatch,
    current: UserInfoEntity,
    flags: { isManager: boolean; isSelf: boolean; isAdmin: boolean },
  ): Promise<Partial<UserInfoEntity>> {
    const out: Partial<UserInfoEntity> = {};
    const allow = (key: keyof UserInfoEntity): boolean => this.isFieldAllowed(key, flags);
    const assignIfChanged = <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => {
      if (next !== current[key]) out[key] = next as never;
    };

    await this.applyBasicFields(patch, current, allow, assignIfChanged);
    this.applyExtendedFields(patch, current, allow, assignIfChanged);
    this.applyManagerSelfOnlyFields(patch, allow, assignIfChanged, flags);
    return out;
  }

  private async applyBasicFields(
    patch: UserInfoPatch,
    current: UserInfoEntity,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
  ): Promise<void> {
    await this.applyNicknameField(patch, current, allow, assignIfChanged);
    this.applyGenderBirthdateFields(patch, allow, assignIfChanged);
    this.applyStringFields(patch, allow, assignIfChanged);
  }

  /**
   * 处理昵称字段（需要唯一性校验）
   */
  private async applyNicknameField(
    patch: UserInfoPatch,
    current: UserInfoEntity,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
  ): Promise<void> {
    if (typeof patch.nickname !== 'undefined' && allow('nickname')) {
      assignIfChanged('nickname', await this.sanitizeNickname(patch.nickname, current));
    }
  }

  /**
   * 处理性别与生日等基础枚举/日期字段
   */
  private applyGenderBirthdateFields(
    patch: UserInfoPatch,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
  ): void {
    if (typeof patch.gender !== 'undefined' && allow('gender')) {
      assignIfChanged('gender', this.sanitizeGender(patch.gender));
    }
    if (typeof patch.birthDate !== 'undefined' && allow('birthDate')) {
      assignIfChanged('birthDate', this.sanitizeBirthDate(patch.birthDate));
    }
  }

  /**
   * 处理可空字符串类字段（avatarUrl/email/signature/address/phone）
   */
  private applyStringFields(
    patch: UserInfoPatch,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
  ): void {
    if (typeof patch.avatarUrl !== 'undefined' && allow('avatarUrl')) {
      assignIfChanged(
        'avatarUrl',
        this.sanitizeNullableString(patch.avatarUrl, 255, '头像 URL 长度不能超过 255'),
      );
    }
    if (typeof patch.email !== 'undefined' && allow('email')) {
      assignIfChanged('email', this.sanitizeNullableString(patch.email, 50, '邮箱长度不能超过 50'));
    }
    if (typeof patch.signature !== 'undefined' && allow('signature')) {
      assignIfChanged(
        'signature',
        this.sanitizeNullableString(patch.signature, 100, '个性签名长度不能超过 100'),
      );
    }
    if (typeof patch.address !== 'undefined' && allow('address')) {
      assignIfChanged(
        'address',
        this.sanitizeNullableString(patch.address, 255, '地址长度不能超过 255'),
      );
    }
    if (typeof patch.phone !== 'undefined' && allow('phone')) {
      assignIfChanged('phone', this.sanitizeNullableString(patch.phone, 20, '电话长度不能超过 20'));
    }
  }

  private applyExtendedFields(
    patch: UserInfoPatch,
    current: UserInfoEntity,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
  ): void {
    if (typeof patch.tags !== 'undefined' && allow('tags')) {
      const v = this.sanitizeTags(patch.tags);
      const eq = JSON.stringify(v) === JSON.stringify(current.tags);
      if (!eq) assignIfChanged('tags', v as never);
    }
    if (typeof patch.geographic !== 'undefined' && allow('geographic')) {
      const v = this.sanitizeGeographic(patch.geographic);
      const eq = JSON.stringify(v) === JSON.stringify(current.geographic);
      if (!eq) assignIfChanged('geographic', v as never);
    }
  }

  private applyManagerSelfOnlyFields(
    patch: UserInfoPatch,
    allow: (key: keyof UserInfoEntity) => boolean,
    assignIfChanged: <K extends keyof UserInfoEntity>(key: K, next: UserInfoEntity[K]) => void,
    _flags: { isManager: boolean; isSelf: boolean; isAdmin: boolean },
  ): void {
    if (typeof patch.userState !== 'undefined') {
      if (!allow('userState')) {
        throw new DomainError(
          PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
          '仅在 manager 自改或 admin 时可修改用户状态',
        );
      }
      assignIfChanged('userState', this.sanitizeUserState(patch.userState));
    }
    if (typeof patch.notifyCount !== 'undefined') {
      if (!allow('notifyCount')) {
        throw new DomainError(
          PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
          '仅在 manager 自改或 admin 时可修改通知计数',
        );
      }
      assignIfChanged('notifyCount', this.sanitizeNonNegativeInt(patch.notifyCount));
    }
    if (typeof patch.unreadCount !== 'undefined') {
      if (!allow('unreadCount')) {
        throw new DomainError(
          PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
          '仅在 manager 自改或 admin 时可修改未读计数',
        );
      }
      assignIfChanged('unreadCount', this.sanitizeNonNegativeInt(patch.unreadCount));
    }
  }

  /**
   * 清洗昵称：去空格、非空、长度限制、唯一性校验
   */
  private async sanitizeNickname(
    value: string | null | undefined,
    current: UserInfoEntity,
  ): Promise<string> {
    const val = (value ?? '').trim();
    if (val.length === 0) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '昵称不可为空');
    }
    if (val.length > 50) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '昵称长度不能超过 50');
    }
    if (val !== current.nickname) {
      const exists = await this.accountService.checkNicknameExists(val);
      if (exists) throw new DomainError(ACCOUNT_ERROR.NICKNAME_TAKEN, '昵称已被占用');
    }
    return val;
  }

  /**
   * 清洗性别枚举：未提供时回退为 SECRET
   */
  private sanitizeGender(value: Gender | null | undefined): Gender {
    return value ?? Gender.SECRET;
  }

  /**
   * 清洗出生日期：YYYY-MM-DD 或 null
   */
  private sanitizeBirthDate(value: string | null | undefined): string | null {
    const val = value ?? null;
    if (val !== null && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '出生日期格式必须为 YYYY-MM-DD');
    }
    return val;
  }

  /**
   * 清洗可空字符串：长度限制
   */
  private sanitizeNullableString(
    value: string | null | undefined,
    maxLen: number,
    tooLongMsg: string,
  ): string | null {
    const val = value ?? null;
    if (val && val.length > maxLen) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, tooLongMsg);
    }
    return val;
  }

  /**
   * 清洗标签：必须为字符串数组或 null
   */
  private sanitizeTags(value: string[] | null | undefined): string[] | null {
    const val = value ?? null;
    if (val !== null && !Array.isArray(val)) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '标签必须是字符串数组或为 null');
    }
    return val ? val.map((v) => String(v)) : null;
  }

  /**
   * 清洗地理信息：对象或 null 原样通过
   */
  private sanitizeGeographic(value: GeographicInfo | null | undefined): GeographicInfo | null {
    return value ?? null;
  }

  private sanitizeUserState(value: UserState | undefined): UserState {
    return value ?? UserState.PENDING;
  }

  private sanitizeNonNegativeInt(value: number | undefined): number {
    const v = typeof value === 'number' ? value : 0;
    if (!Number.isInteger(v) || v < 0) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '计数必须为不小于 0 的整数');
    }
    return v;
  }

  /**
   * 字段允许策略（isSelf / isManager）
   * - manager 自改：允许 nickname / gender / birthDate / avatarUrl / email / signature / address / phone / tags / geographic / userState
   * - manager 改他人：仅允许 nickname / avatarUrl / phone
   * - 非 manager：允许基础与联系白名单（不含 userState）
   */
  private isFieldAllowed(
    key: keyof UserInfoEntity,
    flags: { isManager: boolean; isSelf: boolean; isAdmin: boolean },
  ): boolean {
    const selfManagerAllowed: (keyof UserInfoEntity)[] = [
      'nickname',
      'gender',
      'birthDate',
      'avatarUrl',
      'email',
      'signature',
      'address',
      'phone',
      'tags',
      'geographic',
      'userState',
      'notifyCount',
      'unreadCount',
    ];
    const managerOtherAllowed: (keyof UserInfoEntity)[] = ['nickname', 'avatarUrl', 'phone'];
    const nonManagerAllowed: (keyof UserInfoEntity)[] = [
      'nickname',
      'gender',
      'birthDate',
      'avatarUrl',
      'email',
      'signature',
      'address',
      'phone',
      'tags',
      'geographic',
    ];

    if (flags.isAdmin) {
      return selfManagerAllowed.includes(key);
    }
    if (flags.isManager) {
      return flags.isSelf ? selfManagerAllowed.includes(key) : managerOtherAllowed.includes(key);
    }
    return nonManagerAllowed.includes(key);
  }

  /**
   * 将补丁应用到实体
   */
  private applyPatchToEntity(target: UserInfoEntity, patch: Partial<UserInfoEntity>): void {
    const keys = Object.keys(patch) as (keyof UserInfoEntity)[];
    for (const k of keys) {
      // 禁止修改敏感/系统字段
      if (k === 'accessGroup' || k === 'metaDigest' || k === 'account' || k === 'accountId') {
        continue;
      }
      // 更新时间由装饰器维护；无需手动写入
      target[k] = patch[k] as never;
    }
  }
}
