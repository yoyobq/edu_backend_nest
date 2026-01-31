// 文件位置：/var/www/backend/src/usecases/course/workflows/request-session-leave.usecase.ts
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
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
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 用户请假输入
 */
export interface RequestSessionLeaveInput {
  readonly sessionId: number;
  readonly learnerId: number;
  readonly reason?: string | null;
}

/**
 * 用户请假输出
 */
export interface RequestSessionLeaveOutput {
  readonly attendance: {
    readonly enrollmentId: number;
    readonly sessionId: number;
    readonly learnerId: number;
    readonly status: ParticipationAttendanceStatus;
    readonly reason: string | null;
    readonly confirmedAt: Date | null;
  };
  readonly isUpdated: boolean;
}

/**
 * 用户请假用例
 * 职责：
 * - 权限：允许 admin / manager / customer
 * - 校验：报名存在且未取消；节次存在；未超过请假截止
 * - 写入：写入出勤为 EXCUSED，并记录原因
 */
@Injectable()
export class RequestSessionLeaveUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly attendanceService: ParticipationAttendanceService,
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
      isCanceled: enrollment.isCanceled,
    });
    await this.ensureCustomerOwnershipIfNeeded(session, enrollment.customerId);
    await this.ensureAttendanceNotLockedOrThrow({ sessionId: input.sessionId });
    const { beforeCutoff } = await this.evaluateLeaveCutoff({
      seriesId: sessionEntity.seriesId,
      session: sessionEntity,
    });
    this.ensureBeforeCutoffOrThrow({ beforeCutoff, sessionEntity });

    const reason = input.reason ?? null;
    const idempotent = await this.tryIdempotentReturn({
      enrollmentId: enrollment.id,
      reason,
    });
    if (idempotent) return idempotent;

    const now = new Date();
    const updated = await this.attendanceService.upsertByEnrollment({
      enrollmentId: enrollment.id,
      sessionId: enrollment.sessionId,
      learnerId: enrollment.learnerId,
      status: ParticipationAttendanceStatus.EXCUSED,
      countApplied: '0.00',
      confirmedByCoachId: null,
      confirmedAt: now,
      remark: reason,
    });
    return {
      attendance: {
        enrollmentId: updated.enrollmentId,
        sessionId: updated.sessionId,
        learnerId: updated.learnerId,
        status: ParticipationAttendanceStatus.EXCUSED,
        reason: updated.remark ?? null,
        confirmedAt: updated.confirmedAt ?? null,
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
    readonly isCanceled: number | null;
  }): void {
    if ((params.isCanceled ?? 0) === 0) return;
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
   * 校验节次出勤未锁定
   * @param params 节次参数对象
   */
  private async ensureAttendanceNotLockedOrThrow(params: {
    readonly sessionId: number;
  }): Promise<void> {
    const finalized = await this.attendanceService.isFinalizedForSession(params.sessionId);
    if (!finalized) return;
    throw new DomainError(
      SESSION_ERROR.SESSION_LOCKED_FOR_ATTENDANCE,
      '该节次出勤已锁定，无法请假',
    );
  }

  /**
   * 幂等返回：已为 EXCUSED 且原因一致时直接返回
   * @param params 报名与原因参数对象
   */
  private async tryIdempotentReturn(params: {
    readonly enrollmentId: number;
    readonly reason: string | null;
  }): Promise<RequestSessionLeaveOutput | null> {
    const existing = await this.attendanceService.findByEnrollmentId(params.enrollmentId);
    if (!existing) return null;
    const isExcused = existing.status === ParticipationAttendanceStatus.EXCUSED;
    const sameReason = (existing.remark ?? null) === params.reason;
    if (!isExcused || !sameReason) return null;
    return {
      attendance: {
        enrollmentId: existing.enrollmentId,
        sessionId: existing.sessionId,
        learnerId: existing.learnerId,
        status: ParticipationAttendanceStatus.EXCUSED,
        reason: existing.remark ?? null,
        confirmedAt: existing.confirmedAt ?? null,
      },
      isUpdated: false,
    };
  }
}
