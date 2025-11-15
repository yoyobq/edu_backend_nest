// src/usecases/course/workflows/cancel-enrollment.usecase.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import {
  DomainError,
  ENROLLMENT_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { InjectDataSource } from '@nestjs/typeorm';
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

    // 查询报名
    const enrollment = await this.enrollmentService.findById(input.enrollmentId);
    if (!enrollment) {
      throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '报名不存在');
    }

    // 若 customer 身份，校验归属
    if (this.isCustomer(session)) {
      const customer = await this.customerService.findByAccountId(session.accountId);
      if (!customer || customer.id !== enrollment.customerId) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权取消该报名');
      }
    }

    // 幂等：已取消则直接返回（无需继续检查状态或截止规则）
    if ((enrollment.isCanceled ?? 0) === 1) {
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

    // 查询节次状态，已结束/已取消则不可取消报名
    const sessionEntity = await this.sessionsService.findById(enrollment.sessionId);
    if (!sessionEntity) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '对应节次不存在');
    }
    if (sessionEntity.status !== SessionStatus.SCHEDULED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前节次不可取消报名');
    }

    // 计算截止逻辑：优先使用节次覆写，否则使用系列默认
    const { beforeCutoff } = await this.evaluateLeaveCutoff(sessionEntity.seriesId, sessionEntity);

    // 若已超过取消阈值，则不允许取消
    if (!beforeCutoff) {
      throw new DomainError(
        ENROLLMENT_ERROR.CANCEL_CUTOFF_EXCEEDED,
        '已超过取消阈值，当前不可取消报名',
        {
          seriesId: sessionEntity.seriesId,
          sessionId: sessionEntity.id,
          startTime: sessionEntity.startTime,
        },
      );
    }

    // 事务：执行取消 → 发布 EnrollmentCancelled（内存 Outbox 放在事务闭包末尾）
    const updated = await this.dataSource.transaction(async () => {
      const u = await this.enrollmentService.cancel(enrollment.id, {
        canceledBy: session.accountId,
        cancelReason: input.reason ?? null,
      });

      const envelope = buildEnvelope({
        type: 'EnrollmentCancelled',
        aggregateType: 'enrollment',
        aggregateId: u.id,
        payload: {
          enrollmentId: u.id,
          sessionId: u.sessionId,
          seriesId: sessionEntity.seriesId,
          learnerId: u.learnerId,
          customerId: u.customerId,
          canceledBy: session.accountId,
          cancelReason: input.reason ?? null,
          beforeCutoff,
        },
        priority: 5,
      });
      await this.outboxWriter.enqueue({ tx: { kind: 'tx' }, envelope });
      return u;
    });

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
}
