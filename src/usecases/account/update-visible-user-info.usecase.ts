// 文件位置：src/usecases/account/update-visible-user-info.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types';
import { Gender, type GeographicInfo } from '@app-types/models/user-info.types';
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

        const sanitized = await this.sanitizePatch(patch, current);
        if (Object.keys(sanitized).length === 0) {
          const view = await this.fetchUserInfoUsecase.executeStrict({
            accountId: targetAccountId,
          });
          return { view, isUpdated: false };
        }

        // 幂等检查
        const hasChanges = this.hasDataChanges(sanitized, current);
        if (!hasChanges) {
          const view = await this.fetchUserInfoUsecase.executeStrict({
            accountId: targetAccountId,
          });
          return { view, isUpdated: false };
        }

        // 应用更新并保存
        this.applyPatchToEntity(current, sanitized);
        await manager.getRepository(UserInfoEntity).save(current);

        const view = await this.fetchUserInfoUsecase.executeStrict({ accountId: targetAccountId });
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
  private async sanitizePatch(
    patch: UserInfoPatch,
    current: UserInfoEntity,
  ): Promise<Partial<UserInfoEntity>> {
    const out: Partial<UserInfoEntity> = {};

    // nickname（需要唯一性）
    if (typeof patch.nickname !== 'undefined') {
      const val = (patch.nickname ?? '').trim();
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
      out.nickname = val;
    }

    // gender
    if (typeof patch.gender !== 'undefined') {
      out.gender = patch.gender ?? Gender.SECRET;
    }

    // birthDate（YYYY-MM-DD 或 null）
    if (typeof patch.birthDate !== 'undefined') {
      const val = patch.birthDate ?? null;
      if (val !== null && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        throw new DomainError(
          ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
          '出生日期格式必须为 YYYY-MM-DD',
        );
      }
      out.birthDate = val;
    }

    // avatarUrl（<= 255）
    if (typeof patch.avatarUrl !== 'undefined') {
      const val = patch.avatarUrl ?? null;
      if (val && val.length > 255) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '头像 URL 长度不能超过 255');
      }
      out.avatarUrl = val;
    }

    // email（<= 50）
    if (typeof patch.email !== 'undefined') {
      const val = patch.email ?? null;
      if (val && val.length > 50) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '邮箱长度不能超过 50');
      }
      out.email = val;
    }

    // signature（<= 100）
    if (typeof patch.signature !== 'undefined') {
      const val = patch.signature ?? null;
      if (val && val.length > 100) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '个性签名长度不能超过 100');
      }
      out.signature = val;
    }

    // address（<= 255）
    if (typeof patch.address !== 'undefined') {
      const val = patch.address ?? null;
      if (val && val.length > 255) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '地址长度不能超过 255');
      }
      out.address = val;
    }

    // phone（<= 20）
    if (typeof patch.phone !== 'undefined') {
      const val = patch.phone ?? null;
      if (val && val.length > 20) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '电话长度不能超过 20');
      }
      out.phone = val;
    }

    // tags（数组或 null）
    if (typeof patch.tags !== 'undefined') {
      const val = patch.tags ?? null;
      if (val !== null && !Array.isArray(val)) {
        throw new DomainError(
          ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED,
          '标签必须是字符串数组或为 null',
        );
      }
      out.tags = val ? val.map((v) => String(v)) : null;
    }

    // geographic（对象或 null）
    if (typeof patch.geographic !== 'undefined') {
      const val = patch.geographic ?? null;
      out.geographic = val;
    }

    return out;
  }

  /**
   * 幂等性检查：是否存在真实数据变更
   */
  private hasDataChanges(updateData: Partial<UserInfoEntity>, current: UserInfoEntity): boolean {
    const keys = Object.keys(updateData) as (keyof UserInfoEntity)[];
    if (keys.length === 0) return false;
    return keys.some((key) => updateData[key] !== current[key]);
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
