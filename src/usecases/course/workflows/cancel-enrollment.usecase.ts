// src/usecases/course/workflows/cancel-enrollment.usecase.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import {
  DomainError,
  ENROLLMENT_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { DataSource } from 'typeorm';

/**
 * 取消报名用例
 * 职责：
 * - 权限：允许 admin / manager；customer 仅能取消自己名下学员的报名
 * - 校验：报名存在；对应节次存在且未结束（SCHEDULED 才允许取消）
 * - 幂等：重复取消返回当前状态
 */
export interface CancelEnrollmentInput {
  readonly enrollmentId: number;
  readonly reason?: string | null;
}

export interface CancelEnrollmentOutput {
  readonly enrollment: {
    readonly id: number;
    readonly sessionId: number;
    readonly learnerId: number;
    readonly customerId: number;
    readonly isCanceled: 0 | 1;
    readonly cancelReason: string | null;
  };
  readonly isUpdated: boolean;
}

@Injectable()
export class CancelEnrollmentUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
    private readonly attendanceService: ParticipationAttendanceService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 执行取消报名
   * @param session 当前用例会话
   * @param input 取消参数
   */
  async execute(
    session: UsecaseSession,
    input: CancelEnrollmentInput,
  ): Promise<CancelEnrollmentOutput> {
    this.ensurePermissions(session);
    const enrollment = await this.loadEnrollmentOrThrow(input.enrollmentId);
    await this.ensureCustomerOwnershipIfNeeded(session, enrollment.customerId);
    const idempotent = await this.tryIdempotentReturn(enrollment);
    if (idempotent) return idempotent;
    const sessionEntity = await this.loadCancelableSessionOrThrow(enrollment.sessionId);
    const { beforeCutoff } = await this.evaluateLeaveCutoff(sessionEntity.seriesId, sessionEntity);
    this.ensureBeforeCutoffOrThrow({ beforeCutoff, sessionEntity });
    const updated = await this.performCancelTxn({
      session,
      enrollment,
      reason: input.reason ?? null,
      beforeCutoff,
      seriesId: sessionEntity.seriesId,
    });
    return this.toOutput(updated);
  }

  /**
   * 计算请假截止逻辑
   * - 优先使用节次上的 `leaveCutoffHoursOverride`
   * - 否则回退为系列的 `leaveCutoffHours`
   * @param seriesId 系列 ID
   * @param session 节次实体
   * @returns 是否在截止前（`beforeCutoff`）等信息
   */
  private async evaluateLeaveCutoff(
    seriesId: number,
    session: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>,
  ): Promise<{ cutoffHours: number; beforeCutoff: boolean }> {
    const series = await this.seriesService.findById(seriesId);
    const defaultHours = series?.leaveCutoffHours ?? 12;
    const cutoffHours = session.leaveCutoffHoursOverride ?? defaultHours;
    const cutoffMillis = cutoffHours * 60 * 60 * 1000;
    const cutoffTime = new Date(session.startTime.getTime() - cutoffMillis);
    const now = new Date();
    return { cutoffHours, beforeCutoff: now.getTime() <= cutoffTime.getTime() };
  }

  /**
   * 权限校验：允许 admin / manager / customer
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed = ['admin', 'manager', 'customer'];
    const ok = session.roles?.some((r) => allowed.includes(r.toLowerCase()));
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权取消报名');
    }
  }

  private isCustomer(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toLowerCase() === 'customer') ?? false;
  }
  /**
   * 加载报名实体并校验存在性
   * @param id 报名 ID
   * @returns 报名实体
   * @throws DomainError 当报名不存在
   */
  private async loadEnrollmentOrThrow(id: number) {
    const enrollment = await this.enrollmentService.findById(id);
    if (!enrollment) {
      throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '报名不存在');
    }
    return enrollment;
  }

  /**
   * 若为 Customer 身份，校验该报名归属当前客户
   * @param session 用例会话
   * @param customerId 报名的客户 ID
   * @throws DomainError 当归属不匹配
   */
  private async ensureCustomerOwnershipIfNeeded(
    session: UsecaseSession,
    customerId: number,
  ): Promise<void> {
    if (!this.isCustomer(session)) return;
    const customer = await this.customerService.findByAccountId(session.accountId);
    if (!customer || customer.id !== customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权取消该报名');
    }
  }

  /**
   * 幂等返回：当报名已取消时，补写出勤为 CANCELLED/0 并直接返回
   * @param enrollment 报名实体
   * @returns 取消结果或 null（表示需继续流程）
   */
  private async tryIdempotentReturn(
    enrollment: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['findById']>>>,
  ): Promise<CancelEnrollmentOutput | null> {
    if ((enrollment.isCanceled ?? 0) !== 1) return null;
    await this.attendanceService.upsertByEnrollment({
      enrollmentId: enrollment.id,
      sessionId: enrollment.sessionId,
      learnerId: enrollment.learnerId,
      status: ParticipationAttendanceStatus.CANCELLED,
      countApplied: '0.00',
    });
    return {
      enrollment: {
        id: enrollment.id,
        sessionId: enrollment.sessionId,
        learnerId: enrollment.learnerId,
        customerId: enrollment.customerId,
        isCanceled: 1,
        cancelReason: enrollment.cancelReason ?? null,
      },
      isUpdated: false,
    };
  }

  /**
   * 加载可取消报名的节次（仅允许 SCHEDULED 状态）
   * @param sessionId 节次 ID
   * @returns 节次实体
   * @throws DomainError 当节次不存在或状态不允许
   */
  private async loadCancelableSessionOrThrow(sessionId: number) {
    const s = await this.sessionsService.findById(sessionId);
    if (!s) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '对应节次不存在');
    }
    if (s.status !== SessionStatus.SCHEDULED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前节次不可取消报名');
    }
    return s;
  }

  /**
   * 截止校验：超过取消阈值则抛错
   * @param params 截止与节次上下文
   * @throws DomainError 当已超过取消阈值
   */
  private ensureBeforeCutoffOrThrow(params: {
    beforeCutoff: boolean;
    sessionEntity: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>;
  }): void {
    if (params.beforeCutoff) return;
    throw new DomainError(
      ENROLLMENT_ERROR.CANCEL_CUTOFF_EXCEEDED,
      '已超过取消阈值，当前不可取消报名',
      {
        seriesId: params.sessionEntity.seriesId,
        sessionId: params.sessionEntity.id,
        startTime: params.sessionEntity.startTime,
      },
    );
  }

  /**
   * 事务取消报名并写入出勤 CANCELLED/0，入箱 EnrollmentCancelled 事件
   * @param params 事务所需上下文与入参
   * @returns 更新后的报名实体
   */
  private async performCancelTxn(params: {
    session: UsecaseSession;
    enrollment: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['findById']>>>;
    reason: string | null;
    beforeCutoff: boolean;
    seriesId: number;
  }) {
    const updated = await this.dataSource.transaction(async () => {
      const u = await this.enrollmentService.cancel(params.enrollment.id, {
        canceledBy: params.session.accountId,
        cancelReason: params.reason ?? null,
      });

      await this.attendanceService.upsertByEnrollment({
        enrollmentId: u.id,
        sessionId: u.sessionId,
        learnerId: u.learnerId,
        status: ParticipationAttendanceStatus.CANCELLED,
        countApplied: '0.00',
      });

      const envelope = buildEnvelope({
        type: 'EnrollmentCancelled',
        aggregateType: 'enrollment',
        aggregateId: u.id,
        payload: {
          enrollmentId: u.id,
          sessionId: u.sessionId,
          seriesId: params.seriesId,
          learnerId: u.learnerId,
          customerId: u.customerId,
          canceledBy: params.session.accountId,
          cancelReason: params.reason ?? null,
          beforeCutoff: params.beforeCutoff,
        },
        priority: 5,
      });
      await this.outboxWriter.enqueue({ envelope });
      return u;
    });
    return updated;
  }

  /**
   * 构造用例输出模型
   * @param updated 更新后的报名实体
   * @returns 取消报名输出
   */
  private toOutput(
    updated: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['cancel']>>>,
  ): CancelEnrollmentOutput {
    return {
      enrollment: {
        id: updated.id,
        sessionId: updated.sessionId,
        learnerId: updated.learnerId,
        customerId: updated.customerId,
        isCanceled: (updated.isCanceled ?? 1) as 0 | 1,
        cancelReason: updated.cancelReason ?? null,
      },
      isUpdated: true,
    };
  }
}
