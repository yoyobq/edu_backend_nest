// src/usecases/course/workflows/load-session-attendance-sheet.usecase.ts
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import {
  ParticipationAttendanceService,
  type AttendanceSheet,
  type AttendanceSheetRow,
} from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

/**
 * 加载节次点名视图 用例
 * 职责：
 * - 鉴权：允许 admin / manager / 本节次 leadCoach 查看
 * - 读取：以 enrollment 为主，左连接 attendance，合成统一点名表结构
 * - 丰富：引入 learner.countPerSession 推导未打点行的默认计次与状态
 */
@Injectable()
export class LoadSessionAttendanceSheetUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly learnerService: LearnerService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 执行加载点名视图
   * @param params 输入：会话与节次 ID
   * @returns 点名表统一结构
   */
  async execute(params: {
    readonly session: UsecaseSession;
    readonly sessionId: number;
  }): Promise<AttendanceSheet> {
    const { session, sessionId } = params;
    const s = await this.sessionsService.findById(sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    await this.ensurePermissions({ session, sessionId, leadCoachId: s.leadCoachId });

    // 1) 报名列表（含取消项），稳定排序：createdAt ASC, id ASC（内存排序）
    const enrollments = await this.enrollmentService.findBySession({ sessionId });
    enrollments.sort((a, b) => {
      const c = a.createdAt.getTime() - b.createdAt.getTime();
      return c !== 0 ? c : a.id - b.id;
    });

    // 2) 学员计次比例预取
    const learnerIds = Array.from(new Set(enrollments.map((e) => e.learnerId)));
    const learners = await this.learnerService.findManyByIds({ ids: learnerIds });
    const learnerCountMap = new Map<number, number>();
    for (const l of learners) learnerCountMap.set(l.id, l.countPerSession);

    // 3) 出勤记录（按 session 拉取并索引到 enrollmentId）
    let attendanceRows = await this.attendanceService.listBySession(sessionId);
    let byEnrollment = new Map<number, (typeof attendanceRows)[number]>();
    for (const r of attendanceRows) byEnrollment.set(r.enrollmentId, r);

    // 4) 初始化缺失的出勤记录（基于 enrollment 补齐）
    const initItems = this.buildInitAttendanceItems({
      enrollments,
      attendanceMap: byEnrollment,
      learnerCountMap,
      sessionId,
    });
    if (initItems.length > 0) {
      const inserted = await this.attendanceService.bulkInsertMissingByEnrollment({
        items: initItems,
      });
      if (inserted > 0) {
        attendanceRows = await this.attendanceService.listBySession(sessionId);
        byEnrollment = new Map<number, (typeof attendanceRows)[number]>();
        for (const r of attendanceRows) byEnrollment.set(r.enrollmentId, r);
      }
    }

    // 5) 合成行并排序（按出勤状态枚举顺序）
    const rows: AttendanceSheetRow[] = enrollments.map((e) => {
      const a = byEnrollment.get(e.id) ?? null;
      const defaultCount = learnerCountMap.get(e.learnerId) ?? 1;
      return this.makeRow({ e, a, defaultCount });
    });
    rows.sort((l, r) => this.compareRowOrder(l, r));

    const isFinalized = await this.attendanceService.isFinalizedForSession(sessionId);
    return { sessionId, isFinalized, rows };
  }

  /**
   * 构建点名表行（合并 enrollment 与 attendance）
   */
  private makeRow(input: {
    readonly e: {
      id: number;
      learnerId: number;
      status: ParticipationEnrollmentStatus;
      statusReason: ParticipationEnrollmentStatusReason | null;
    };
    readonly a: {
      status?: ParticipationAttendanceStatus;
      countApplied?: string;
      confirmedByCoachId?: number | null;
      confirmedAt?: Date | null;
      finalizedAt?: Date | null;
    } | null;
    readonly defaultCount: number;
  }): AttendanceSheetRow {
    const canceled: 0 | 1 = input.e.status === ParticipationEnrollmentStatus.CANCELED ? 1 : 0;
    const isLeave = input.e.status === ParticipationEnrollmentStatus.LEAVE;
    const attendanceStatus = this.deriveStatus({ a: input.a, isCanceled: canceled, isLeave });
    const countApplied = this.deriveCountApplied({
      a: input.a,
      isCanceled: canceled,
      isLeave,
      defaultCount: input.defaultCount,
    });
    return {
      enrollmentId: input.e.id,
      learnerId: input.e.learnerId,
      attendanceStatus,
      countApplied,
      confirmedByCoachId: input.a?.confirmedByCoachId ?? null,
      confirmedAt: input.a?.confirmedAt ?? null,
      finalized: (input.a?.finalizedAt ?? null) != null,
      status: input.e.status,
      statusReason: input.e.statusReason ?? null,
    };
  }

  private buildInitAttendanceItems(params: {
    readonly enrollments: ReadonlyArray<{
      id: number;
      learnerId: number;
      status: ParticipationEnrollmentStatus;
    }>;
    readonly attendanceMap: Map<
      number,
      {
        status?: ParticipationAttendanceStatus;
        countApplied?: string;
        confirmedByCoachId?: number | null;
        confirmedAt?: Date | null;
        finalizedAt?: Date | null;
      }
    >;
    readonly learnerCountMap: Map<number, number>;
    readonly sessionId: number;
  }): ReadonlyArray<{
    enrollmentId: number;
    sessionId: number;
    learnerId: number;
    status: ParticipationAttendanceStatus;
    countApplied: string;
  }> {
    const items: Array<{
      enrollmentId: number;
      sessionId: number;
      learnerId: number;
      status: ParticipationAttendanceStatus;
      countApplied: string;
    }> = [];
    for (const e of params.enrollments) {
      if (params.attendanceMap.has(e.id)) continue;
      const isCanceled: 0 | 1 = e.status === ParticipationEnrollmentStatus.CANCELED ? 1 : 0;
      const isLeave = e.status === ParticipationEnrollmentStatus.LEAVE;
      const defaultCount = params.learnerCountMap.get(e.learnerId) ?? 1;
      const status = this.deriveStatus({ a: null, isCanceled, isLeave });
      const countApplied = this.deriveCountApplied({
        a: null,
        isCanceled,
        isLeave,
        defaultCount,
      });
      items.push({
        enrollmentId: e.id,
        sessionId: params.sessionId,
        learnerId: e.learnerId,
        status,
        countApplied,
      });
    }
    return items;
  }

  /**
   * 推导默认出勤状态
   */
  private deriveStatus(input: {
    readonly a: { status?: ParticipationAttendanceStatus } | null;
    readonly isCanceled: 0 | 1;
    readonly isLeave: boolean;
  }): ParticipationAttendanceStatus {
    const s = input.a?.status;
    if (s != null) return s;
    if (input.isCanceled === 1) return ParticipationAttendanceStatus.CANCELLED;
    if (input.isLeave) return ParticipationAttendanceStatus.EXCUSED;
    return ParticipationAttendanceStatus.NO_SHOW;
  }

  /**
   * 推导默认计次
   */
  private deriveCountApplied(input: {
    readonly a: { countApplied?: string } | null;
    readonly isCanceled: 0 | 1;
    readonly isLeave: boolean;
    readonly defaultCount: number | string;
  }): string {
    const v = input.a?.countApplied;
    if (v != null) return v;
    if (input.isCanceled === 1 || input.isLeave) return '0.00';
    const num =
      typeof input.defaultCount === 'number'
        ? input.defaultCount
        : Number.parseFloat(String(input.defaultCount));
    const safe = Number.isFinite(num) ? num : 0;
    return safe.toFixed(2);
  }

  /**
   * 权限校验：允许 admin / manager / 本节次 leadCoach / coCoach 查看
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
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次点名表');
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次点名表');
    }
    if (coach.id === leadCoachId) return;
    const bound = await this.sessionCoachesService.findByUnique({ sessionId, coachId: coach.id });
    if (!bound) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次点名表');
    }
  }

  /**
   * 比较两个点名表行的展示顺序（按出勤状态枚举顺序 + enrollmentId）
   */
  private compareRowOrder(left: AttendanceSheetRow, right: AttendanceSheetRow): number {
    const li = this.getStatusIndex(left.attendanceStatus);
    const ri = this.getStatusIndex(right.attendanceStatus);
    if (li !== ri) return li - ri;
    return left.enrollmentId - right.enrollmentId;
  }

  /**
   * 获取出勤状态的排序索引（按枚举当前顺序）
   */
  private getStatusIndex(status: ParticipationAttendanceStatus): number {
    switch (status) {
      case ParticipationAttendanceStatus.NO_SHOW:
        return 0;
      case ParticipationAttendanceStatus.PRESENT:
        return 1;
      case ParticipationAttendanceStatus.EXCUSED:
        return 2;
      case ParticipationAttendanceStatus.LATE_CANCEL:
        return 3;
      case ParticipationAttendanceStatus.CANCELLED:
        return 4;
      case ParticipationAttendanceStatus.NO_SHOW_WAIVED:
        return 5;
      default:
        return 99;
    }
  }
}
