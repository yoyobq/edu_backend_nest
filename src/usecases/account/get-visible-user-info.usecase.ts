// 文件位置：src/usecases/account/get-visible-user-info.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types';
import { expandRoles, hasRole } from '@core/account/policy/role-access.policy';
import { canViewUserInfo } from '@core/account/policy/user-info-visibility.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { UsecaseSession } from '@src/types/auth/session.types';
import { FetchUserInfoUsecase } from './fetch-user-info.usecase';

export type VisibleDetailMode = 'BASIC' | 'FULL';

@Injectable()
export class GetVisibleUserInfoUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly fetchUserInfoUsecase: FetchUserInfoUsecase,
  ) {}

  /**
   * 执行按可见性读取用户信息
   * - 角色策略：
   *   - ADMIN：可查看所有人的用户信息
   *   - MANAGER: 可查看自己、Coach、Customer、Learner 的用户信息（不含 Manager）
   *   - COACH：可查看自己、Customer、Learner 的用户信息（不含 Coach/Manager）
   *   - CUSTOMER：可查看自己及名下 Learner 的用户信息
   *   - LEARNER：仅可查看自己的用户信息（禁止学员查看其他学员）
   *   - 其他角色：仅可查看自己
   * - 读取实现：统一通过 Account 域的 UserInfo 读取，保持与账户绑定
   * - 按需反馈：支持 'BASIC' 与 'FULL' 两种详情级别
   */
  async execute(params: {
    session: UsecaseSession;
    targetAccountId: number;
    detail?: VisibleDetailMode;
  }): Promise<UserInfoView> {
    const { session, targetAccountId } = params;
    const detail: VisibleDetailMode = params.detail ?? 'FULL';

    if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '非法的目标账户 ID');
    }

    const allowed = await this.isAllowedToView(session, targetAccountId);
    if (!allowed) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限查看该用户信息');
    }

    const view = await this.fetchUserInfoUsecase.executeStrict({ accountId: targetAccountId });

    if (detail === 'BASIC') {
      return this.maskToBasic(view);
    }
    return view;
  }

  /**
   * 角色可见性策略判定
   */
  private async isAllowedToView(
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
    };

    return canViewUserInfo(session.roles, facts);
  }

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
   * 按需反馈：将完整视图收敛为基础字段视图
   */
  private maskToBasic(view: UserInfoView): UserInfoView {
    return {
      accountId: view.accountId,
      nickname: view.nickname,
      gender: view.gender,
      birthDate: view.birthDate,
      avatarUrl: view.avatarUrl,
      email: null,
      signature: null,
      accessGroup: view.accessGroup,
      address: null,
      phone: view.phone,
      tags: null,
      geographic: null,
      metaDigest: null,
      notifyCount: 0,
      unreadCount: 0,
      userState: view.userState,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
