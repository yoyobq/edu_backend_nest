// 文件位置：/var/www/backend/src/usecases/course/workflows/request-session-leave.usecase.ts
import {
  DomainError,
  ENROLLMENT_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

/**
 * 用户请假输入
 */
export interface RequestSessionLeaveInput {
  readonly sessionId: number;
  readonly learnerId: number;
  readonly reason?: ParticipationEnrollmentStatusReason | null;
}

/**
 * 用户请假输出
 */
export interface RequestSessionLeaveOutput {
  readonly enrollment: {
    readonly id: number;
    readonly sessionId: number;
    readonly learnerId: number;
    readonly customerId: number;
    readonly status: ParticipationEnrollmentStatus;
    readonly statusReason: ParticipationEnrollmentStatusReason | null;
  };
  readonly isUpdated: boolean;
}

/**
 * 用户请假用例
 * 职责：
 * - 权限：允许 admin / manager / customer
 * - 校验：报名存在且未取消；节次存在；未超过请假截止
 * - 写入：更新报名状态为 LEAVE 并记录原因
 */
@Injectable()
export class RequestSessionLeaveUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * 执行用户请假
   * @param session 用例会话
   * @param input 请假输入
   * @returns 请假结果
   */
  async execute(
    session: UsecaseSession,
    input: RequestSessionLeaveInput,
  ): Promise<RequestSessionLeaveOutput> {
    this.ensurePermissions(session);
    const sessionEntity = await this.loadSessionOrThrow({ sessionId: input.sessionId });
    const enrollment = await this.loadEnrollmentByUniqueOrThrow({
      sessionId: input.sessionId,
      learnerId: input.learnerId,
    });
    this.ensureEnrollmentActiveOrThrow({
      enrollmentId: enrollment.id,
      status: enrollment.status,
    });
    await this.ensureCustomerOwnershipIfNeeded(session, enrollment.customerId);
    const { beforeCutoff } = await this.evaluateLeaveCutoff({
      seriesId: sessionEntity.seriesId,
      session: sessionEntity,
    });
    this.ensureBeforeCutoffOrThrow({ beforeCutoff, sessionEntity });

    const reason = input.reason ?? null;
    const status = this.resolveStatusFromReason({ reason });
    this.ensureLeaveReasonOrThrow({ reason, status });
    const idempotent = this.tryIdempotentReturn({
      reason,
      enrollment,
    });
    if (idempotent) return idempotent;

    const updated = await this.enrollmentService.updateStatus({
      id: enrollment.id,
      status,
      reason,
      statusChangedBy: session.accountId ?? null,
    });
    return {
      enrollment: {
        id: updated.id,
        sessionId: updated.sessionId,
        learnerId: updated.learnerId,
        customerId: updated.customerId,
        status: updated.status,
        statusReason: updated.statusReason ?? null,
      },
      isUpdated: true,
    };
  }

  /**
   * 权限校验：允许 admin / manager / customer
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed = ['admin', 'manager', 'customer'];
    const ok = session.roles?.some((r) => allowed.includes(String(r).toLowerCase()));
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权执行请假操作');
    }
  }

  /**
   * 加载节次并校验存在性
   * @param params 节次 ID 参数对象
   */
  private async loadSessionOrThrow(params: {
    readonly sessionId: number;
  }): Promise<NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>> {
    const s = await this.sessionsService.findById(params.sessionId);
    if (!s) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }
    return s;
  }

  /**
   * 加载报名并校验存在性
   * @param params 节次与学员参数对象
   */
  private async loadEnrollmentByUniqueOrThrow(params: {
    readonly sessionId: number;
    readonly learnerId: number;
  }) {
    const enrollment = await this.enrollmentService.findByUnique({
      sessionId: params.sessionId,
      learnerId: params.learnerId,
    });
    if (!enrollment) {
      throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '报名不存在');
    }
    return enrollment;
  }

  /**
   * 校验报名未取消
   * @param params 报名取消状态参数对象
   */
  private ensureEnrollmentActiveOrThrow(params: {
    readonly enrollmentId: number;
    readonly status: ParticipationEnrollmentStatus;
  }): void {
    if (params.status !== ParticipationEnrollmentStatus.CANCELED) return;
    throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_ALREADY_CANCELED, '报名已取消，无法请假', {
      enrollmentId: params.enrollmentId,
    });
  }

  /**
   * 若为 customer 身份，校验该报名归属当前客户
   * @param session 用例会话
   * @param customerId 报名的客户 ID
   */
  private async ensureCustomerOwnershipIfNeeded(
    session: UsecaseSession,
    customerId: number,
  ): Promise<void> {
    if (!this.isCustomer(session)) return;
    const customer = await this.customerService.findByAccountId(session.accountId);
    if (!customer || customer.id !== customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权为该学员请假');
    }
  }

  /**
   * 判断是否为 customer 身份
   * @param session 用例会话
   */
  private isCustomer(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toLowerCase() === 'customer') ?? false;
  }

  /**
   * 计算请假截止逻辑
   * - 优先使用节次上的 leaveCutoffHoursOverride
   * - 否则回退为系列的 leaveCutoffHours
   * @param params 系列与节次参数对象
   * @returns 是否在截止前
   */
  private async evaluateLeaveCutoff(params: {
    readonly seriesId: number;
    readonly session: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>;
  }): Promise<{ beforeCutoff: boolean }> {
    const series = await this.seriesService.findById(params.seriesId);
    const defaultHours = series?.leaveCutoffHours ?? 12;
    const cutoffHours = params.session.leaveCutoffHoursOverride ?? defaultHours;
    const cutoffMillis = cutoffHours * 60 * 60 * 1000;
    const cutoffTime = new Date(params.session.startTime.getTime() - cutoffMillis);
    const now = new Date();
    return { beforeCutoff: now.getTime() <= cutoffTime.getTime() };
  }

  /**
   * 截止校验：超过请假阈值则抛错
   * @param params 截止与节次上下文
   */
  private ensureBeforeCutoffOrThrow(params: {
    readonly beforeCutoff: boolean;
    readonly sessionEntity: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>;
  }): void {
    if (params.beforeCutoff) return;
    throw new DomainError(ENROLLMENT_ERROR.LEAVE_CUTOFF_EXCEEDED, '已超过请假阈值，当前不可请假', {
      seriesId: params.sessionEntity.seriesId,
      sessionId: params.sessionEntity.id,
      startTime: params.sessionEntity.startTime,
    });
  }

  /**
   * 幂等返回：已为 LEAVE 且原因一致时直接返回
   * @param params 报名与原因参数对象
   */
  private tryIdempotentReturn(params: {
    readonly reason: ParticipationEnrollmentStatusReason | null;
    readonly enrollment: NonNullable<
      Awaited<ReturnType<ParticipationEnrollmentService['findByUnique']>>
    >;
  }): RequestSessionLeaveOutput | null {
    const isLeave = params.enrollment.status === ParticipationEnrollmentStatus.LEAVE;
    const sameReason = (params.enrollment.statusReason ?? null) === params.reason;
    if (!isLeave || !sameReason) return null;
    return {
      enrollment: {
        id: params.enrollment.id,
        sessionId: params.enrollment.sessionId,
        learnerId: params.enrollment.learnerId,
        customerId: params.enrollment.customerId,
        status: params.enrollment.status,
        statusReason: params.enrollment.statusReason ?? null,
      },
      isUpdated: false,
    };
  }

  /**
   * 判断原因是否为 LEAVE 枚举
   * @param reason 报名状态原因
   */
  private isLeaveReason(reason: ParticipationEnrollmentStatusReason): boolean {
    return reason.startsWith('LEAVE_');
  }

  /**
   * 根据原因推导报名状态
   * @param params 原因参数对象
   */
  private resolveStatusFromReason(params: {
    readonly reason: ParticipationEnrollmentStatusReason | null;
  }): ParticipationEnrollmentStatus {
    if (params.reason == null) return ParticipationEnrollmentStatus.LEAVE;
    return this.isLeaveReason(params.reason)
      ? ParticipationEnrollmentStatus.LEAVE
      : ParticipationEnrollmentStatus.CANCELED;
  }

  /**
   * 校验请假原因为 LEAVE 枚举
   * @param params 原因与状态参数对象
   */
  private ensureLeaveReasonOrThrow(params: {
    readonly reason: ParticipationEnrollmentStatusReason | null;
    readonly status: ParticipationEnrollmentStatus;
  }): void {
    if (params.reason == null) return;
    if (params.status === ParticipationEnrollmentStatus.LEAVE) return;
    throw new DomainError(ENROLLMENT_ERROR.INVALID_PARAMS, '请假原因非法', {
      reason: params.reason,
    });
  }
}
