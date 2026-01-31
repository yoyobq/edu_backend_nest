// 文件位置：/var/www/backend/src/usecases/course/workflows/enroll-learner-to-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  ENROLLMENT_ERROR,
  isDomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';
import { ParticipationEnrollmentStatus } from '@src/types/models/participation-enrollment.types';

export interface EnrollLearnerToSeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly learnerId: number;
  readonly remark?: string | null;
}

export interface EnrollLearnerToSeriesFailedItem {
  readonly sessionId: number;
  readonly code: string;
  readonly message: string;
}

export interface EnrollLearnerToSeriesOutput {
  readonly createdEnrollmentIds: number[];
  readonly restoredEnrollmentIds: number[];
  readonly unchangedEnrollmentIds: number[];
  readonly failed: EnrollLearnerToSeriesFailedItem[];
}

type OccupiedWindow = {
  readonly sessionId: number;
  readonly startTime: Date;
  readonly endTime: Date;
};

/**
 * 开课班批量报名用例
 *
 * 语义：
 * - 为指定开课班的所有“未开课”节次批量报名
 * - 返回已创建 / 已恢复 / 未变更 / 失败明细列表
 *
 * 权限：
 * - customer：仅可操作自己名下学员
 * - manager：需具备对应客户的管理权限
 * - admin：允许
 */
@Injectable()
export class EnrollLearnerToSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 执行开课班批量报名
   * @param input 会话与报名参数
   * @returns 批量报名结果（创建/恢复/未变更/失败明细）
   */
  async execute(input: EnrollLearnerToSeriesInput): Promise<EnrollLearnerToSeriesOutput> {
    const learner = await this.requireLearner(input.learnerId);
    const series = await this.requireSeries(input.seriesId);
    await this.assertAccess({ session: input.session, learnerCustomerId: learner.customerId });
    this.ensureSeriesStatusOrThrow(series);
    const skipCapacityCheck = this.shouldSkipCapacityCheck(input.session);

    const allSessions = await this.sessionsService.listAllBySeries({
      seriesId: input.seriesId,
      maxSessions: 200,
      statusFilter: [SessionStatus.SCHEDULED],
    });
    const now = new Date();
    const targetSessions = allSessions.filter((s) => s.startTime.getTime() >= now.getTime());

    const createdEnrollmentIds: number[] = [];
    const restoredEnrollmentIds: number[] = [];
    const unchangedEnrollmentIds: number[] = [];
    const failed: EnrollLearnerToSeriesFailedItem[] = [];

    if (targetSessions.length === 0) {
      return { createdEnrollmentIds, restoredEnrollmentIds, unchangedEnrollmentIds, failed };
    }

    const occupied = await this.loadOccupiedWindows({ learnerId: input.learnerId });

    for (const session of targetSessions) {
      try {
        const existing = await this.enrollmentService.findByUnique({
          sessionId: session.id,
          learnerId: input.learnerId,
        });
        if (existing && existing.status !== ParticipationEnrollmentStatus.CANCELED) {
          unchangedEnrollmentIds.push(existing.id);
          continue;
        }
        this.ensureNoScheduleConflictOrThrow({
          occupied,
          target: { startTime: session.startTime, endTime: session.endTime },
        });
        if (!skipCapacityCheck) {
          await this.ensureCapacityOrThrow({ sessionId: session.id, seriesId: series.id });
        }

        if (existing && existing.status === ParticipationEnrollmentStatus.CANCELED) {
          const restored = await this.enrollmentService.restore(existing.id, {
            updatedBy: input.session.accountId,
          });
          restoredEnrollmentIds.push(restored.id);
          this.pushOccupiedWindow({ occupied, session });
          continue;
        }

        const created = await this.enrollmentService.create({
          sessionId: session.id,
          learnerId: input.learnerId,
          customerId: learner.customerId,
          remark: input.remark ?? null,
          createdBy: input.session.accountId,
        });
        createdEnrollmentIds.push(created.id);
        this.pushOccupiedWindow({ occupied, session });
        await this.enqueueEnrollmentCreated({
          enrollmentId: created.id,
          sessionId: created.sessionId,
          learnerId: created.learnerId,
          customerId: created.customerId,
          remark: created.remark ?? null,
        });
      } catch (e) {
        if (isDomainError(e)) {
          failed.push({ sessionId: session.id, code: e.code, message: e.message });
          continue;
        }
        throw e;
      }
    }

    return { createdEnrollmentIds, restoredEnrollmentIds, unchangedEnrollmentIds, failed };
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
   * 读取开课班并校验存在性
   * @param seriesId 开课班 ID
   * @returns 开课班实体
   */
  private async requireSeries(seriesId: number) {
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }
    return series;
  }

  /**
   * 开课班状态校验
   * @param series 开课班实体
   */
  private ensureSeriesStatusOrThrow(
    series: NonNullable<Awaited<ReturnType<CourseSeriesService['findById']>>>,
  ): void {
    if (
      series.status === CourseSeriesStatus.CLOSED ||
      series.status === CourseSeriesStatus.FINISHED
    ) {
      throw new DomainError(ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED, '当前开课班已封班或结课');
    }
  }

  /**
   * 权限校验：customer 仅可访问自己名下学员，manager/admin 需具备管理权限
   * @param params 用例会话与学员所属客户
   */
  private async assertAccess(params: {
    readonly session: UsecaseSession;
    readonly learnerCustomerId: number;
  }): Promise<void> {
    const isCustomer = hasRole(params.session.roles, IdentityTypeEnum.CUSTOMER);
    const isManager = hasRole(params.session.roles, IdentityTypeEnum.MANAGER);
    const isAdmin = hasRole(params.session.roles, IdentityTypeEnum.ADMIN);

    if (!isCustomer && !isManager && !isAdmin) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色');
    }

    if (isAdmin) return;

    if (isManager) {
      const manager = await this.managerService.findByAccountId(params.session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Manager 身份');
      }
      const ok = await this.managerService.hasPermissionForCustomer(
        manager.id,
        params.learnerCustomerId,
      );
      if (!ok) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
      }
      return;
    }

    const customer = await this.customerService.findByAccountId(params.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    if (customer.id !== params.learnerCustomerId) {
      throw new DomainError(LEARNER_ERROR.LEARNER_CUSTOMER_MISMATCH, '学员不属于当前客户');
    }
  }

  private shouldSkipCapacityCheck(session: UsecaseSession): boolean {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    return isAdmin || isManager;
  }

  /**
   * 装载学员已报名节次的时间窗口
   * @param params 学员参数
   * @returns 已占用时间窗口列表
   */
  private async loadOccupiedWindows(params: {
    readonly learnerId: number;
  }): Promise<OccupiedWindow[]> {
    const active = await this.enrollmentService.findActiveByLearnerId({
      learnerId: params.learnerId,
    });
    const sessionIds = active.map((e) => e.sessionId);
    if (sessionIds.length === 0) return [];
    const sessions = await Promise.all(sessionIds.map((id) => this.sessionsService.findById(id)));
    return sessions
      .filter((s): s is NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>> => !!s)
      .map((s) => ({ sessionId: s.id, startTime: s.startTime, endTime: s.endTime }));
  }

  /**
   * 写入占用窗口，避免后续节次产生时间冲突
   * @param params 占用窗口与节次
   */
  private pushOccupiedWindow(params: {
    readonly occupied: OccupiedWindow[];
    readonly session: NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>;
  }): void {
    params.occupied.push({
      sessionId: params.session.id,
      startTime: params.session.startTime,
      endTime: params.session.endTime,
    });
  }

  /**
   * 时间冲突校验
   * @param params 已占用窗口与目标时间
   */
  private ensureNoScheduleConflictOrThrow(params: {
    readonly occupied: ReadonlyArray<OccupiedWindow>;
    readonly target: { readonly startTime: Date; readonly endTime: Date };
  }): void {
    const conflict = params.occupied.some(
      (w) => params.target.startTime < w.endTime && params.target.endTime > w.startTime,
    );
    if (conflict) {
      throw new DomainError(ENROLLMENT_ERROR.SCHEDULE_CONFLICT, '该学员存在时间冲突的报名');
    }
  }

  /**
   * 容量校验
   * @param params 节次与系列参数
   */
  private async ensureCapacityOrThrow(params: {
    readonly sessionId: number;
    readonly seriesId: number;
  }): Promise<void> {
    const count = await this.enrollmentService.countEffectiveBySession({
      sessionId: params.sessionId,
    });
    const series = await this.seriesService.findById(params.seriesId);
    if (!series) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '节次引用的系列不存在');
    }
    if (count >= series.maxLearners) {
      throw new DomainError(ENROLLMENT_ERROR.CAPACITY_EXCEEDED, '该节次容量已满');
    }
  }

  /**
   * 推送 EnrollmentCreated 事件到 Outbox
   * @param params 报名数据
   */
  private async enqueueEnrollmentCreated(params: {
    readonly enrollmentId: number;
    readonly sessionId: number;
    readonly learnerId: number;
    readonly customerId: number;
    readonly remark: string | null;
  }): Promise<void> {
    const envelope = buildEnvelope({
      type: 'EnrollmentCreated',
      aggregateType: 'Enrollment',
      aggregateId: params.enrollmentId,
      payload: {
        sessionId: params.sessionId,
        learnerId: params.learnerId,
        customerId: params.customerId,
        remark: params.remark,
      },
      priority: 6,
    });
    await this.outboxWriter.enqueue({ envelope });
  }
}
