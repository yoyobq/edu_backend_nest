// 文件位置：src/usecases/course/workflows/batch-record-attendance.usecase.ts
import {
  ATTENDANCE_ERROR,
  DomainError,
  ENROLLMENT_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import {
  buildEnvelope,
  type IntegrationEventEnvelope,
} from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { ParticipationAttendanceStatus } from '@src/types/models/attendance.types';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

export interface BatchRecordItemInput {
  enrollmentId: number;
  status: ParticipationAttendanceStatus;
  countApplied: string;
  remark?: string | null;
}

export interface BatchRecordAttendanceInput {
  sessionId: number;
  items: ReadonlyArray<BatchRecordItemInput>;
}

export interface BatchRecordAttendanceOutput {
  updatedCount: number;
  unchangedCount: number;
}

/**
 * 批量记录节次出勤 用例
 * 职责：
 * - 鉴权：manager / admin / leadCoach
 * - 校验：session 存在且状态允许；enrollment 属于该 session；未终审
 * - 写入：attendance.bulkUpsert（幂等），自动派生 countApplied 与确认留痕
 * - 事件：写入 AttendanceUpdated（批次级）
 * TODO：
 * - 扩展副教练参与权限
 * - 根据业务定义从 learner.countPerSession 派生 countApplied
 */
@Injectable()
export class BatchRecordAttendanceUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly learnerService: LearnerService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 执行批量记录出勤
   * @param session 用例会话
   * @param input 批量输入
   * @returns 更新与未变更计数
   */
  async execute(
    session: UsecaseSession,
    input: BatchRecordAttendanceInput,
  ): Promise<BatchRecordAttendanceOutput> {
    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    await this.ensurePermissions({
      session,
      sessionId: input.sessionId,
      leadCoachId: s.leadCoachId,
    });

    const finalized = await this.attendanceService.isFinalizedForSession(input.sessionId);
    if (finalized) {
      throw new DomainError(
        SESSION_ERROR.SESSION_LOCKED_FOR_ATTENDANCE,
        '该节次出勤已锁定，无法更新',
      );
    }

    const roles = (session.roles ?? []).map((r) => String(r).toLowerCase());
    const canOverrideCount = roles.includes('admin') || roles.includes('manager');

    const result = await this.dataSource.transaction(async (manager) => {
      const res = await this.performBatchTransaction({ session, input, canOverrideCount, manager });
      await this.outboxWriter.enqueue({
        envelope: res.envelope,
        tx: { kind: 'tx', opaque: manager },
      });
      return res;
    });

    return { updatedCount: result.updatedCount, unchangedCount: result.unchangedCount };
  }

  /**
   * 权限校验：允许 admin / manager / 本节次 leadCoach / coCoach
   * @param params 会话与节次上下文
   */
  private async ensurePermissions(params: {
    readonly session: UsecaseSession;
    readonly sessionId: number;
    readonly leadCoachId: number;
  }): Promise<void> {
    const { session, sessionId, leadCoachId } = params;
    const roles = (session.roles ?? []).map((r) => String(r).toLowerCase());
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    if (isAdmin || isManager) return;
    if (!roles.includes('coach') || session.accountId == null) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权记录该节次出勤');
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权记录该节次出勤');
    }
    if (coach.id === leadCoachId) return;
    const bound = await this.sessionCoachesService.findByUnique({ sessionId, coachId: coach.id });
    if (!bound) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权记录该节次出勤');
    }
  }

  /**
   * 校验批量输入中不存在重复报名 ID
   * @param params 批量记录项
   */
  private validateNoDuplicateEnrollmentIds(params: {
    readonly items: ReadonlyArray<BatchRecordItemInput>;
  }): void {
    const ids = params.items.map((it) => it.enrollmentId);
    const uniq = new Set<number>(ids);
    if (uniq.size !== ids.length) {
      const seen = new Set<number>();
      const dup: number[] = [];
      for (const id of ids) {
        if (seen.has(id) && !dup.includes(id)) {
          dup.push(id);
        } else {
          seen.add(id);
        }
      }
      throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_PARAMS, '存在重复的报名 ID', {
        duplicates: dup,
      });
    }
  }

  /**
   * 根据出勤状态派生 countApplied 字符串（管理身份可覆盖）
   */

  private async performBatchTransaction(params: {
    readonly session: UsecaseSession;
    readonly input: BatchRecordAttendanceInput;
    readonly canOverrideCount: boolean;
    readonly manager: EntityManager;
  }): Promise<{
    updatedCount: number;
    unchangedCount: number;
    envelope: IntegrationEventEnvelope;
  }> {
    const { session, input, canOverrideCount, manager } = params;
    const now = new Date();

    this.validateNoDuplicateEnrollmentIds({ items: input.items });
    this.ensureStatuses(input.items);

    const { enrMap, learnerCountMap } = await this.loadContext({ input, manager });
    const validated = this.validateAndMapItems({
      items: input.items,
      enrMap,
      learnerCountMap,
      sessionId: input.sessionId,
      canOverrideCount,
    });

    await this.ensureNotFinalizedInTxn({ sessionId: input.sessionId });

    const upsertItems = this.buildUpsertItems({
      validated,
      sessionId: input.sessionId,
      accountId: session.accountId,
      now,
    });

    const { updatedCount, unchangedCount, envelope } = await this.upsertAndBuildEnvelope({
      manager,
      upsertItems,
      sessionId: input.sessionId,
      validated,
    });

    return { updatedCount, unchangedCount, envelope };
  }

  /**
   * 加载报名与学员计次上下文（同事务视图）
   */
  private async loadContext(params: {
    readonly input: BatchRecordAttendanceInput;
    readonly manager: EntityManager;
  }): Promise<{
    readonly enrMap: Map<
      number,
      Awaited<ReturnType<ParticipationEnrollmentService['findManyByIds']>>[number]
    >;
    readonly learnerCountMap: Map<number, number>;
  }> {
    const ids = Array.from(new Set(params.input.items.map((it) => it.enrollmentId)));
    const enrList = await this.enrollmentService.findManyByIds({ ids, manager: params.manager });
    if (enrList.length !== ids.length) {
      throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '存在未找到的报名');
    }
    const enrMap = new Map<number, (typeof enrList)[number]>();
    for (const enr of enrList) enrMap.set(enr.id, enr);
    const learnerIds = Array.from(new Set(enrList.map((e) => e.learnerId)));
    const learners = await this.learnerService.findManyByIds({
      ids: learnerIds,
      manager: params.manager,
    });
    const learnerCountMap = new Map<number, number>();
    for (const l of learners) {
      const normalized = this.normalizeCountUnit(l.countPerSession as unknown as number | string);
      learnerCountMap.set(l.id, normalized);
    }
    return { enrMap, learnerCountMap };
  }

  /**
   * 校验并映射输入项为待写入数据
   */
  private validateAndMapItems(params: {
    readonly items: ReadonlyArray<BatchRecordItemInput>;
    readonly enrMap: Map<
      number,
      Awaited<ReturnType<ParticipationEnrollmentService['findManyByIds']>>[number]
    >;
    readonly learnerCountMap: Map<number, number>;
    readonly sessionId: number;
    readonly canOverrideCount: boolean;
  }): Array<{
    enrollmentId: number;
    learnerId: number;
    status: ParticipationAttendanceStatus;
    countApplied: string;
    remark: string | null;
  }> {
    return params.items.map((item) => {
      const enr = params.enrMap.get(item.enrollmentId)!;
      if (enr.sessionId !== params.sessionId) {
        throw new DomainError(ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED, '报名不属于该节次');
      }
      // 禁止未取消报名时标记为 CANCELLED，保持语义一致
      if (
        Number(enr.isCanceled ?? 0) === 0 &&
        item.status === ParticipationAttendanceStatus.CANCELLED
      ) {
        throw new DomainError(
          ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED,
          '未取消的报名不允许标记为 CANCELLED，请使用 EXCUSED 或 NO_SHOW',
          { enrollmentId: item.enrollmentId, status: item.status },
        );
      }
      if (
        Number(enr.isCanceled ?? 0) === 1 &&
        item.status !== ParticipationAttendanceStatus.CANCELLED
      ) {
        throw new DomainError(
          ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED,
          '已取消报名仅允许保持取消状态，若要修改出勤，请管理员修改报名状态',
          { enrollmentId: item.enrollmentId, status: item.status },
        );
      }
      const applied = this.calcCountApplied({
        status: item.status,
        isCanceled: Number(enr.isCanceled ?? 0) === 1 ? 1 : 0,
        defaultCount: params.learnerCountMap.get(enr.learnerId) ?? 1,
        override: params.canOverrideCount ? item.countApplied : undefined,
      });
      return {
        enrollmentId: item.enrollmentId,
        learnerId: enr.learnerId,
        status: item.status,
        countApplied: applied,
        remark: item.remark ?? null,
      };
    });
  }

  /**
   * 事务内校验节次未定稿
   */
  private async ensureNotFinalizedInTxn(params: { readonly sessionId: number }): Promise<void> {
    const finalizedNow = await this.attendanceService.isFinalizedForSession(params.sessionId);
    if (finalizedNow) {
      throw new DomainError(
        SESSION_ERROR.SESSION_LOCKED_FOR_ATTENDANCE,
        '该节次出勤已锁定，无法更新',
      );
    }
  }

  /**
   * 构建批量写入项
   */
  private buildUpsertItems(params: {
    readonly validated: ReadonlyArray<{
      enrollmentId: number;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      countApplied: string;
      remark: string | null;
    }>;
    readonly sessionId: number;
    readonly accountId: number | null;
    readonly now: Date;
  }): ReadonlyArray<{
    enrollmentId: number;
    sessionId: number;
    learnerId: number;
    status: ParticipationAttendanceStatus;
    countApplied: string;
    confirmedByCoachId: number | null;
    confirmedAt: Date | null;
    remark: string | null;
  }> {
    return params.validated.map((v) => ({
      enrollmentId: v.enrollmentId,
      sessionId: params.sessionId,
      learnerId: v.learnerId,
      status: v.status,
      countApplied: v.countApplied,
      confirmedByCoachId: params.accountId,
      confirmedAt: params.now,
      remark: v.remark,
    }));
  }

  /**
   * 写入并构建事件信封
   */
  private async upsertAndBuildEnvelope(params: {
    readonly manager: EntityManager;
    readonly upsertItems: ReadonlyArray<{
      enrollmentId: number;
      sessionId: number;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      countApplied: string;
      confirmedByCoachId: number | null;
      confirmedAt: Date | null;
      remark: string | null;
    }>;
    readonly sessionId: number;
    readonly validated: ReadonlyArray<{
      enrollmentId: number;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      countApplied: string;
      remark: string | null;
    }>;
  }): Promise<{
    updatedCount: number;
    unchangedCount: number;
    envelope: IntegrationEventEnvelope;
  }> {
    const { manager, upsertItems, sessionId, validated } = params;
    const { updatedCount, unchangedCount } = await this.attendanceService.bulkUpsert({
      items: upsertItems,
      manager,
    });
    const payloadAffected = validated
      .slice()
      .sort((a, b) => a.enrollmentId - b.enrollmentId)
      .map((v) => ({
        enrollmentId: v.enrollmentId,
        learnerId: v.learnerId,
        status: v.status,
        countApplied: v.countApplied,
        remark: v.remark,
      }));
    const hashInput = payloadAffected
      .map((v) => `${v.enrollmentId}:${v.status}:${v.countApplied}:${String(v.remark ?? '')}`)
      .join('|');
    const digest = createHash('sha256').update(hashInput).digest('hex');
    const dedupKey = `AttendanceUpdated:${sessionId}:${digest}`;
    const envelope = buildEnvelope({
      type: 'AttendanceUpdated',
      aggregateType: 'session',
      aggregateId: sessionId,
      priority: 5,
      dedupKey,
      payload: {
        sessionId,
        updatedCount,
        unchangedCount,
        affected: payloadAffected,
      },
    });
    return { updatedCount, unchangedCount, envelope };
  }

  private ensureStatuses(items: ReadonlyArray<BatchRecordItemInput>): void {
    for (const item of items) {
      if (!Object.values(ParticipationAttendanceStatus).includes(item.status)) {
        throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_STATUS, '出勤状态非法', {
          status: item.status,
        });
      }
    }
  }

  private calcCountApplied(params: {
    readonly status: ParticipationAttendanceStatus;
    readonly isCanceled: 0 | 1;
    readonly defaultCount: number;
    readonly override?: string;
  }): string {
    const zeroStatuses = new Set<ParticipationAttendanceStatus>([
      ParticipationAttendanceStatus.CANCELLED,
      ParticipationAttendanceStatus.EXCUSED,
      ParticipationAttendanceStatus.NO_SHOW_WAIVED,
    ]);
    if (params.isCanceled === 1 || zeroStatuses.has(params.status)) return '0.00';
    if (params.override != null) {
      const v = params.override;
      if (typeof v !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(v)) {
        throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_PARAMS, '计次格式非法', {
          countApplied: v,
        });
      }
      const num = Number(v);
      if (!Number.isFinite(num) || num <= 0 || num > 99.99) {
        throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_PARAMS, '计次数值非法', {
          countApplied: v,
        });
      }
      return num.toFixed(2);
    }
    const def = Number.isFinite(params.defaultCount) ? params.defaultCount : 0;
    return def.toFixed(2);
  }

  /**
   * 规范化学员每节计次比例：数值化、上界校验并量化到 1 位精度
   */
  private normalizeCountUnit(value: number | string): number {
    const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(num) || num < 0) return 0;
    const capped = Math.min(num, 9.99);
    const rounded1 = Math.round(capped * 10) / 10; // 1 位精度
    return rounded1;
  }
}
