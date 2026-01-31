// src/usecases/course/workflows/enroll-learner-to-session.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  DomainError,
  ENROLLMENT_ERROR,
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
import { type UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

/**
 * 为学员报名到节次用例
 * 职责：
 * - 权限校验：仅允许 Customer 自助为自己名下学员报名，或 Manager / Admin 执行
 * - 业务校验：节次必须存在且处于 SCHEDULED；学员存在且归属客户
 * - 幂等：若该学员已报名该节次，则直接返回已存在的报名记录
 */
/**
 * 输入参数
 */
export interface EnrollLearnerToSessionInput {
  readonly sessionId: number;
  readonly learnerId: number;
  readonly remark?: string | null;
}

/**
 * 输出结果
 */
export interface EnrollLearnerToSessionOutput {
  readonly enrollment: {
    readonly id: number;
    readonly sessionId: number;
    readonly learnerId: number;
    readonly customerId: number;
    readonly status: ParticipationEnrollmentStatus;
    readonly statusReason: ParticipationEnrollmentStatusReason | null;
    readonly remark: string | null;
  };
  readonly isNewlyCreated: boolean;
}

@Injectable()
export class EnrollLearnerToSessionUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    /** Outbox 写入端口（通过 modules 层 DI 注入实现） */
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 执行报名编排
   * @param session 当前用例会话
   * @param input 报名输入参数
   */
  async execute(
    session: UsecaseSession,
    input: EnrollLearnerToSessionInput,
  ): Promise<EnrollLearnerToSessionOutput> {
    /**
     * 用例编排流程：
     * 1. 权限与基础校验（节次、学员、容量、时间冲突）
     * 2. 幂等创建或恢复报名记录
     * 3. 若为新建报名，则构造 EnrollmentCreated 集成事件入箱（Outbox），由调度器异步分发
     */
    const foundSession = await this.validateSessionOrThrow(input.sessionId);
    const { customerId } = await this.validateLearnerOrThrow(input.learnerId);
    await this.assertAccess({ session, learnerCustomerId: customerId });
    const existing = await this.enrollmentService.findByUnique({
      sessionId: input.sessionId,
      learnerId: input.learnerId,
    });
    if (existing && existing.status === ParticipationEnrollmentStatus.ENROLLED) {
      return {
        enrollment: {
          id: existing.id,
          sessionId: existing.sessionId,
          learnerId: existing.learnerId,
          customerId: existing.customerId,
          status: existing.status,
          statusReason: existing.statusReason ?? null,
          remark: existing.remark ?? null,
        },
        isNewlyCreated: false,
      };
    }
    const series = await this.requireSeries(foundSession.seriesId);
    this.ensureSeriesStatusOrThrow(series);
    const skipCapacityCheck = this.shouldSkipCapacityCheck(session);
    if (!skipCapacityCheck) {
      await this.ensureCapacityOrThrow({ sessionId: foundSession.id, series });
    }
    // 重复报名同一节次应视为幂等，不应触发时间冲突
    await this.ensureNoScheduleConflictOrThrow(
      input.learnerId,
      foundSession.startTime,
      foundSession.endTime,
      foundSession.id,
    );
    const result = await this.upsertEnrollment(session, input, customerId);

    // 新创建报名时写入 Outbox，以便异步通知等副作用处理
    if (result.isNewlyCreated) {
      const envelope = buildEnvelope({
        type: 'EnrollmentCreated',
        aggregateType: 'Enrollment',
        aggregateId: result.enrollment.id,
        // 默认 schemaVersion = 1，dedupKey = type:aggregateId:schemaVersion
        // 载荷包含必要只读数据，避免泄露 ORM 实体
        payload: {
          sessionId: result.enrollment.sessionId,
          learnerId: result.enrollment.learnerId,
          customerId: result.enrollment.customerId,
          remark: result.enrollment.remark,
        },
        // 优先级较高，用于尽快通知占位
        priority: 8,
        // 无延迟投递；correlationId 暂无法从 UsecaseSession 映射，留空
      });
      await this.outboxWriter.enqueue({ envelope });
    }

    return result;
  }

  /**
   * 权限校验：customer 仅可操作自己名下学员，manager/admin 需具备管理权限
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

  /**
   * 判断给定时间段是否与学员已报名的任一节次冲突
   * @param sessionIds 学员已有有效报名对应的节次 ID 列表
   * @param start 目标节次开始时间
   * @param end 目标节次结束时间
   * @returns 是否存在时间冲突
   */
  private async hasScheduleConflict(
    sessionIds: number[],
    start: Date,
    end: Date,
  ): Promise<boolean> {
    if (sessionIds.length === 0) return false;
    // 逐个加载节次时间进行重叠判断（可优化为批量查询）
    const sessions = await Promise.all(sessionIds.map((id) => this.sessionsService.findById(id)));
    for (const s of sessions) {
      if (!s) continue;
      // 区间重叠判断：start < s.end && end > s.start
      if (start < s.endTime && end > s.startTime) return true;
    }
    return false;
  }

  /**
   * 校验节次存在且可报名
   * @param sessionId 节次 ID
   * @returns 节次模型
   */
  private async validateSessionOrThrow(
    sessionId: number,
  ): Promise<NonNullable<Awaited<ReturnType<CourseSessionsService['findById']>>>> {
    const found = await this.sessionsService.findById(sessionId);
    if (!found) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }
    if (found.status !== SessionStatus.SCHEDULED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前节次不可报名');
    }
    return found;
  }

  /**
   * 校验学员存在并返回客户归属
   * @param learnerId 学员 ID
   * @returns 包含 customerId 的对象
   */
  private async validateLearnerOrThrow(
    learnerId: number,
  ): Promise<{ learner: Awaited<ReturnType<LearnerService['findById']>>; customerId: number }> {
    const learner = await this.learnerService.findById(learnerId);
    if (!learner) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    }
    const customerId = learner.customerId;
    if (!customerId) {
      throw new DomainError(ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED, '学员未绑定客户');
    }
    return { learner, customerId };
  }

  /**
   * 是否跳过容量校验
   */
  private shouldSkipCapacityCheck(session: UsecaseSession): boolean {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    return isAdmin || isManager;
  }

  /**
   * 读取开课班并校验存在性
   * @param seriesId 开课班 ID
   * @returns 开课班实体
   */
  private async requireSeries(
    seriesId: number,
  ): Promise<NonNullable<Awaited<ReturnType<CourseSeriesService['findById']>>>> {
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '节次引用的系列不存在');
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
   * 容量校验：系列容量与当前有效报名人数
   * @param params 节次与系列参数
   */
  private async ensureCapacityOrThrow(params: {
    readonly sessionId: number;
    readonly series: NonNullable<Awaited<ReturnType<CourseSeriesService['findById']>>>;
  }): Promise<void> {
    const count = await this.enrollmentService.countEffectiveBySession({
      sessionId: params.sessionId,
    });
    if (count >= params.series.maxLearners) {
      throw new DomainError(ENROLLMENT_ERROR.CAPACITY_EXCEEDED, '该节次容量已满');
    }
  }

  /**
   * 时间冲突校验
   * @param learnerId 学员 ID
   * @param start 开始时间
   * @param end 结束时间
   */
  /**
   * 时间冲突校验（排除目标节次以保证重复报名幂等）
   * @param learnerId 学员 ID
   * @param start 开始时间
   * @param end 结束时间
   * @param excludeSessionId 可选：排除的节次 ID（通常为当前目标节次）
   */
  private async ensureNoScheduleConflictOrThrow(
    learnerId: number,
    start: Date,
    end: Date,
    excludeSessionId?: number,
  ): Promise<void> {
    const active = await this.enrollmentService.findActiveByLearnerId({ learnerId });
    const sessionIds = active
      .map((e) => e.sessionId)
      .filter((id) => (excludeSessionId === undefined ? true : id !== excludeSessionId));
    if (sessionIds.length === 0) return;
    const conflict = await this.hasScheduleConflict(sessionIds, start, end);
    if (conflict) {
      throw new DomainError(ENROLLMENT_ERROR.SCHEDULE_CONFLICT, '该学员存在时间冲突的报名');
    }
  }

  /**
   * 幂等创建或恢复报名
   * @param session 当前用例会话
   * @param input 报名输入参数
   * @param customerId 客户 ID
   * @returns 报名输出
   */
  private async upsertEnrollment(
    session: UsecaseSession,
    input: EnrollLearnerToSessionInput,
    customerId: number,
  ): Promise<EnrollLearnerToSessionOutput> {
    const existing = await this.enrollmentService.findByUnique({
      sessionId: input.sessionId,
      learnerId: input.learnerId,
    });

    if (existing) {
      if (existing.status === ParticipationEnrollmentStatus.CANCELED) {
        const restored = await this.enrollmentService.restore(existing.id, {
          updatedBy: session.accountId,
        });
        return {
          enrollment: {
            id: restored.id,
            sessionId: restored.sessionId,
            learnerId: restored.learnerId,
            customerId: restored.customerId,
            status: restored.status,
            statusReason: restored.statusReason ?? null,
            remark: restored.remark ?? null,
          },
          isNewlyCreated: false,
        };
      }
      return {
        enrollment: {
          id: existing.id,
          sessionId: existing.sessionId,
          learnerId: existing.learnerId,
          customerId: existing.customerId,
          status: existing.status,
          statusReason: existing.statusReason ?? null,
          remark: existing.remark ?? null,
        },
        isNewlyCreated: false,
      };
    }

    const created = await this.enrollmentService.create({
      sessionId: input.sessionId,
      learnerId: input.learnerId,
      customerId,
      remark: input.remark ?? null,
      createdBy: session.accountId,
    });
    return {
      enrollment: {
        id: created.id,
        sessionId: created.sessionId,
        learnerId: created.learnerId,
        customerId: created.customerId,
        status: created.status,
        statusReason: created.statusReason ?? null,
        remark: created.remark ?? null,
      },
      isNewlyCreated: created.createdAt.getTime() === created.updatedAt.getTime(),
    };
  }
}
