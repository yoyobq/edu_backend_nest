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
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';
import { DataSource } from 'typeorm';

const CUSTOMER_REGRET_MILLIS = 10 * 60 * 1000;

/**
 * 取消报名用例
 * 职责：
 * - 权限：允许 admin / manager；customer 仅能取消自己名下学员的报名
 * - 校验：报名存在；节次存在；Customer 仅支持“当场后悔”撤销
 * - 幂等：重复取消返回当前状态
 */
export interface CancelEnrollmentInput {
  readonly enrollmentId?: number;
  readonly sessionId?: number;
  readonly learnerId?: number;
  readonly reason?: ParticipationEnrollmentStatusReason | null;
}

export interface CancelEnrollmentOutput {
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

@Injectable()
export class CancelEnrollmentUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
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
    const enrollment = await this.loadEnrollmentFromInputOrThrow(input);
    await this.ensureCustomerOwnershipIfNeeded(session, enrollment.customerId);
    this.ensureCancelReasonOrThrow({ reason: input.reason ?? null });
    const idempotent = this.tryIdempotentReturn(enrollment);
    if (idempotent) return idempotent;
    const sessionEntity = await this.loadCancelableSessionOrThrow({
      session,
      sessionId: enrollment.sessionId,
    });

    const { beforeCutoff } = await this.evaluateLeaveCutoff(sessionEntity.seriesId, sessionEntity);

    if (!this.isAdmin(session)) {
      this.ensureBeforeSessionStartOrThrow(sessionEntity);
      if (this.isCustomer(session)) {
        this.ensureWithinCustomerRegretOrThrow(enrollment);
      } else {
        this.ensureBeforeCutoffOrThrow({ beforeCutoff, sessionEntity });
      }
    }

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
   * 从输入参数定位报名
   * @param input 用例输入参数
   * @returns 报名实体
   * @throws DomainError 当参数不足或报名不存在
   */
  private async loadEnrollmentFromInputOrThrow(input: CancelEnrollmentInput) {
    if (typeof input.enrollmentId === 'number') {
      return await this.loadEnrollmentOrThrow(input.enrollmentId);
    }
    if (typeof input.sessionId === 'number' && typeof input.learnerId === 'number') {
      return await this.loadEnrollmentByUniqueOrThrow({
        sessionId: input.sessionId,
        learnerId: input.learnerId,
      });
    }
    throw new DomainError(
      ENROLLMENT_ERROR.INVALID_PARAMS,
      '取消报名参数不完整，需要 enrollmentId 或 (sessionId + learnerId)',
    );
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
   * 判断是否为管理员身份
   * @param session 用例会话
   */
  private isAdmin(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toLowerCase() === 'admin') ?? false;
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
   * 通过唯一键加载报名实体并校验存在性
   * @param params 唯一键（sessionId + learnerId）
   * @returns 报名实体
   * @throws DomainError 当报名不存在
   */
  private async loadEnrollmentByUniqueOrThrow(params: { sessionId: number; learnerId: number }) {
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
   * 幂等返回：当报名已取消时直接返回
   * @param enrollment 报名实体
   * @returns 取消结果或 null（表示需继续流程）
   */
  private tryIdempotentReturn(
    enrollment: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['findById']>>>,
  ): CancelEnrollmentOutput | null {
    if (enrollment.status !== ParticipationEnrollmentStatus.CANCELED) return null;
    return {
      enrollment: {
        id: enrollment.id,
        sessionId: enrollment.sessionId,
        learnerId: enrollment.learnerId,
        customerId: enrollment.customerId,
        status: enrollment.status,
        statusReason: enrollment.statusReason ?? null,
      },
      isUpdated: false,
    };
  }

  /**
   * 加载可取消报名的节次（仅允许 SCHEDULED 状态）
   * - Admin：允许取消任意状态的节次报名（用于纠错）
   * - 非 Admin：仅允许 SCHEDULED 状态
   * @param params 会话与节次 ID
   * @returns 节次实体
   * @throws DomainError 当节次不存在或状态不允许
   */
  private async loadCancelableSessionOrThrow(params: {
    session: UsecaseSession;
    sessionId: number;
  }) {
    const s = await this.sessionsService.findById(params.sessionId);
    if (!s) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '对应节次不存在');
    }
    if (!this.isAdmin(params.session) && s.status !== SessionStatus.SCHEDULED) {
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
   * 节次开始时间校验：已到上课时间则不可取消
   * @param sessionEntity 节次实体
   * @throws DomainError 当节次已开始
   */
  private ensureBeforeSessionStartOrThrow(
    sessionEntity: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>,
  ): void {
    const now = new Date();
    if (now.getTime() < sessionEntity.startTime.getTime()) return;
    throw new DomainError(
      ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED,
      '已到上课时间，当前不可取消报名',
      {
        seriesId: sessionEntity.seriesId,
        sessionId: sessionEntity.id,
        startTime: sessionEntity.startTime,
      },
    );
  }

  /**
   * Customer 撤销窗口校验：仅允许报名后短时间内“当场后悔”撤销
   * @param enrollment 报名实体
   * @throws DomainError 当超过撤销窗口
   */
  private ensureWithinCustomerRegretOrThrow(
    enrollment: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['findById']>>>,
  ): void {
    const createdAt = enrollment.createdAt;
    const now = new Date();
    if (now.getTime() - createdAt.getTime() <= CUSTOMER_REGRET_MILLIS) return;
    throw new DomainError(
      ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED,
      '仅支持报名后短时间内撤销，请按请假流程处理',
      {
        enrollmentId: enrollment.id,
        createdAt,
      },
    );
  }

  /**
   * 事务取消报名并入箱 EnrollmentCancelled 事件
   * @param params 事务所需上下文与入参
   * @returns 更新后的报名实体
   */
  private async performCancelTxn(params: {
    session: UsecaseSession;
    enrollment: NonNullable<Awaited<ReturnType<ParticipationEnrollmentService['findById']>>>;
    reason: ParticipationEnrollmentStatusReason | null;
    beforeCutoff: boolean;
    seriesId: number;
  }) {
    const updated = await this.dataSource.transaction(async () => {
      const u = await this.enrollmentService.cancel(params.enrollment.id, {
        canceledBy: params.session.accountId,
        statusReason: params.reason ?? null,
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
          statusReason: params.reason ?? null,
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
        status: updated.status,
        statusReason: updated.statusReason ?? null,
      },
      isUpdated: true,
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
   * 校验取消原因为非 LEAVE 枚举
   * @param params 原因参数对象
   */
  private ensureCancelReasonOrThrow(params: {
    readonly reason: ParticipationEnrollmentStatusReason | null;
  }): void {
    if (params.reason == null) return;
    if (!this.isLeaveReason(params.reason)) return;
    throw new DomainError(ENROLLMENT_ERROR.INVALID_PARAMS, '取消原因非法', {
      reason: params.reason,
    });
  }
}
