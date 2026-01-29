// 文件位置：/var/www/backend/src/usecases/course/workflows/cancel-series-enrollment.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  isDomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';
import { CancelEnrollmentUsecase } from './cancel-enrollment.usecase';

export interface CancelSeriesEnrollmentInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly learnerId: number;
  readonly reason?: string | null;
}

export interface CancelSeriesEnrollmentFailedItem {
  readonly enrollmentId: number;
  readonly code: string;
  readonly message: string;
}

export interface CancelSeriesEnrollmentOutput {
  readonly canceledEnrollmentIds: number[];
  readonly unchangedEnrollmentIds: number[];
  readonly failed: CancelSeriesEnrollmentFailedItem[];
}

/**
 * 取消开课班报名用例
 *
 * 语义：
 * - 对同一开课班（series）下的报名做批量取消
 * - 返回成功 / 未变更 / 失败的 enrollmentId 列表，便于前端汇总展示
 *
 * 权限：
 * - customer：仅可操作自己名下学员（但每条报名仍受「当场后悔」限制）
 * - manager：需具备对应客户的管理权限
 * - admin：允许
 */
@Injectable()
export class CancelSeriesEnrollmentUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly cancelEnrollmentUsecase: CancelEnrollmentUsecase,
  ) {}

  /**
   * 执行批量取消开课班报名
   * @param input 会话与取消参数
   * @returns 批量取消结果（成功/未变更/失败明细）
   */
  async execute(input: CancelSeriesEnrollmentInput): Promise<CancelSeriesEnrollmentOutput> {
    const learner = await this.requireLearner(input.learnerId);
    await this.requireSeries(input.seriesId);
    await this.assertAccess(input.session, learner.customerId);

    const enrollmentIds = await this.enrollmentService.listActiveEnrollmentIdsByLearnerAndSeries({
      learnerId: input.learnerId,
      seriesId: input.seriesId,
    });

    const canceledEnrollmentIds: number[] = [];
    const unchangedEnrollmentIds: number[] = [];
    const failed: CancelSeriesEnrollmentFailedItem[] = [];

    for (const enrollmentId of enrollmentIds) {
      try {
        const r = await this.cancelEnrollmentUsecase.execute(input.session, {
          enrollmentId,
          reason: input.reason ?? null,
        });
        if (r.isUpdated) {
          canceledEnrollmentIds.push(enrollmentId);
        } else {
          unchangedEnrollmentIds.push(enrollmentId);
        }
      } catch (e) {
        if (isDomainError(e)) {
          failed.push({ enrollmentId, code: e.code, message: e.message });
          continue;
        }
        throw e;
      }
    }

    return { canceledEnrollmentIds, unchangedEnrollmentIds, failed };
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
   * 校验开课班存在性
   * @param seriesId 开课班 ID
   */
  private async requireSeries(seriesId: number): Promise<void> {
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }
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
