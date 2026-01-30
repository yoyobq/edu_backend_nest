// 文件位置：src/usecases/course/workflows/has-learner-enrollment.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, LEARNER_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface HasLearnerEnrollmentInput {
  readonly session: UsecaseSession;
  readonly learnerId: number;
}

export interface HasLearnerEnrollmentOutput {
  readonly hasEnrollment: boolean;
}

/**
 * 判断学员是否存在已报名的开课班
 *
 * 规则：
 * - 允许 customer 查询自己名下学员
 * - 允许 manager/admin 查询其可管理的学员
 */
@Injectable()
export class HasLearnerEnrollmentUsecase {
  constructor(
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行查询
   * @param input 会话与查询参数
   * @returns 是否存在已报名的开课班
   */
  async execute(input: HasLearnerEnrollmentInput): Promise<HasLearnerEnrollmentOutput> {
    const learner = await this.requireLearner(input.learnerId);
    await this.assertAccess(input.session, learner.customerId);
    const hasEnrollment = await this.enrollmentService.hasActiveEnrollmentByLearner({
      learnerId: input.learnerId,
    });
    return { hasEnrollment };
  }

  /**
   * 读取学员并校验存在性
   * @param learnerId 学员 ID
   * @returns 学员实体
   */
  private async requireLearner(learnerId: number) {
    const learner = await this.learnerService.findById(learnerId);
    if (!learner || learner.deactivatedAt) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');
    }
    return learner;
  }

  /**
   * 权限校验：customer 仅可访问自己名下学员，manager/admin 需具备管理权限
   * @param session 用例会话
   * @param learnerCustomerId 学员所属客户 ID
   */
  private async assertAccess(session: UsecaseSession, learnerCustomerId: number): Promise<void> {
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);

    if (!isCustomer && !isManager && !isAdmin) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色');
    }

    if (isAdmin) return;

    if (isManager) {
      const manager = await this.managerService.findByAccountId(session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Manager 身份');
      }
      const ok = await this.managerService.hasPermissionForCustomer(manager.id, learnerCustomerId);
      if (!ok) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
      }
      return;
    }

    const customer = await this.customerService.findByAccountId(session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    if (customer.id !== learnerCustomerId) {
      throw new DomainError(LEARNER_ERROR.LEARNER_CUSTOMER_MISMATCH, '学员不属于当前客户');
    }
  }
}
