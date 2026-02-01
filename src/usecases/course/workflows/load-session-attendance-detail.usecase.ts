// 文件位置：src/usecases/course/workflows/load-session-attendance-detail.usecase.ts
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { Gender } from '@app-types/models/user-info.types';
import {
  ACCOUNT_ERROR,
  DomainError,
  ENROLLMENT_ERROR,
  LEARNER_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import {
  ParticipationAttendanceService,
  type AttendanceSheetRow,
} from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

export interface LoadSessionAttendanceDetailInput {
  readonly session: UsecaseSession;
  readonly sessionId: number;
}

export type SessionAttendanceDetailItem = {
  enrollmentId: number;
  learnerId: number;
  learnerName: string;
  gender: Gender;
  age: number | null;
  avatarUrl: string | null;
  specialNeeds: string | null;
  attendanceStatus: string;
  countApplied: string;
  enrollmentStatus: ParticipationEnrollmentStatus;
  enrollmentStatusReason: ParticipationEnrollmentStatusReason | null;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  customerRemainingSessions: number;
};

export type LoadSessionAttendanceDetailOutput = {
  sessionId: number;
  items: ReadonlyArray<SessionAttendanceDetailItem>;
};

@Injectable()
export class LoadSessionAttendanceDetailUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 加载节次出勤明细（含学员信息与客户信息）
   * @param params 会话与节次 ID
   * @returns 出勤明细列表
   */
  async execute(
    params: LoadSessionAttendanceDetailInput,
  ): Promise<LoadSessionAttendanceDetailOutput> {
    const { session, sessionId } = params;
    await this.loadSessionAndCheckPermissions({ session, sessionId });
    const enrollments = await this.loadEnrollmentsSorted({ sessionId });
    const { enrollmentMap, learnerMap, customerMap, learnerCountMap } = await this.loadRelatedMaps({
      enrollments,
    });
    const sheetRows = await this.buildAttendanceRows({
      sessionId,
      enrollments,
      learnerCountMap,
    });
    const items = this.buildDetailItems({
      sheetRows,
      enrollmentMap,
      learnerMap,
      customerMap,
    });

    return {
      sessionId,
      items,
    };
  }

  private async loadSessionAndCheckPermissions(params: {
    readonly session: UsecaseSession;
    readonly sessionId: number;
  }): Promise<void> {
    const { session, sessionId } = params;
    const sessionEntity = await this.sessionsService.findById(sessionId);
    if (!sessionEntity) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }
    await this.ensurePermissions({
      session,
      sessionId,
      leadCoachId: sessionEntity.leadCoachId,
    });
  }

  private async loadEnrollmentsSorted(params: {
    readonly sessionId: number;
  }): Promise<
    ReadonlyArray<Awaited<ReturnType<ParticipationEnrollmentService['findBySession']>>[number]>
  > {
    const enrollments = await this.enrollmentService.findBySession({
      sessionId: params.sessionId,
    });
    enrollments.sort((a, b) => {
      const c = a.createdAt.getTime() - b.createdAt.getTime();
      return c !== 0 ? c : a.id - b.id;
    });
    return enrollments;
  }

  private async loadRelatedMaps(params: {
    readonly enrollments: ReadonlyArray<{
      id: number;
      learnerId: number;
      customerId: number;
    }>;
  }): Promise<{
    enrollmentMap: Map<number, (typeof params.enrollments)[number]>;
    learnerMap: Map<number, Awaited<ReturnType<LearnerService['findManyByIds']>>[number]>;
    customerMap: Map<number, Awaited<ReturnType<CustomerService['findManyByIds']>>[number]>;
    learnerCountMap: Map<number, number>;
  }> {
    const enrollmentMap = new Map<number, (typeof params.enrollments)[number]>();
    for (const e of params.enrollments) {
      enrollmentMap.set(e.id, e);
    }

    const learnerIds = Array.from(new Set(params.enrollments.map((e) => e.learnerId)));
    const learners = await this.learnerService.findManyByIds({ ids: learnerIds });
    const learnerMap = new Map<number, (typeof learners)[number]>();
    for (const learner of learners) learnerMap.set(learner.id, learner);
    const learnerCountMap = new Map<number, number>();
    for (const learner of learners) learnerCountMap.set(learner.id, learner.countPerSession);

    const customerIds = Array.from(new Set(params.enrollments.map((e) => e.customerId)));
    const customers = await this.customerService.findManyByIds({ ids: customerIds });
    const customerMap = new Map<number, (typeof customers)[number]>();
    for (const customer of customers) customerMap.set(customer.id, customer);

    return { enrollmentMap, learnerMap, customerMap, learnerCountMap };
  }

  private async buildAttendanceRows(params: {
    readonly sessionId: number;
    readonly enrollments: ReadonlyArray<
      Awaited<ReturnType<ParticipationEnrollmentService['findBySession']>>[number]
    >;
    readonly learnerCountMap: Map<number, number>;
  }): Promise<AttendanceSheetRow[]> {
    let attendanceRows = await this.attendanceService.listBySession(params.sessionId);
    let attendanceMap = new Map<number, (typeof attendanceRows)[number]>();
    for (const row of attendanceRows) attendanceMap.set(row.enrollmentId, row);
    const initItems = this.buildInitAttendanceItems({
      enrollments: params.enrollments,
      attendanceMap,
      learnerCountMap: params.learnerCountMap,
      sessionId: params.sessionId,
    });
    if (initItems.length > 0) {
      const inserted = await this.attendanceService.bulkInsertMissingByEnrollment({
        items: initItems,
      });
      if (inserted > 0) {
        attendanceRows = await this.attendanceService.listBySession(params.sessionId);
        attendanceMap = new Map<number, (typeof attendanceRows)[number]>();
        for (const row of attendanceRows) attendanceMap.set(row.enrollmentId, row);
      }
    }
    const sheetRows: AttendanceSheetRow[] = params.enrollments.map((e) => {
      const a = attendanceMap.get(e.id) ?? null;
      const defaultCount = params.learnerCountMap.get(e.learnerId) ?? 1;
      return this.makeRow({ e, a, defaultCount });
    });
    sheetRows.sort((left, right) => this.compareRowOrder(left, right));
    return sheetRows;
  }

  private buildDetailItems(params: {
    readonly sheetRows: ReadonlyArray<AttendanceSheetRow>;
    readonly enrollmentMap: Map<number, { id: number; learnerId: number; customerId: number }>;
    readonly learnerMap: Map<
      number,
      {
        id: number;
        name: string;
        gender: Gender;
        birthDate: string | null;
        avatarUrl: string | null;
        specialNeeds: string | null;
        deactivatedAt: Date | null;
      }
    >;
    readonly customerMap: Map<
      number,
      {
        id: number;
        name: string;
        contactPhone: string | null;
        remainingSessions: number;
        deactivatedAt: Date | null;
      }
    >;
  }): SessionAttendanceDetailItem[] {
    const items: SessionAttendanceDetailItem[] = [];
    for (const row of params.sheetRows) {
      const enrollment = params.enrollmentMap.get(row.enrollmentId);
      if (!enrollment) {
        throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '报名不存在');
      }
      const learner = params.learnerMap.get(enrollment.learnerId);
      if (!learner || learner.deactivatedAt) {
        throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');
      }
      const customer = params.customerMap.get(enrollment.customerId);
      if (!customer || customer.deactivatedAt) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在或已被删除');
      }

      items.push({
        enrollmentId: row.enrollmentId,
        learnerId: row.learnerId,
        learnerName: learner.name,
        gender: learner.gender,
        age: this.computeAge(learner.birthDate),
        avatarUrl: learner.avatarUrl ?? null,
        specialNeeds: learner.specialNeeds ?? null,
        attendanceStatus: String(row.attendanceStatus),
        countApplied: row.countApplied,
        enrollmentStatus: row.status,
        enrollmentStatusReason: row.statusReason,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.contactPhone ?? null,
        customerRemainingSessions: Number(customer.remainingSessions),
      });
    }
    return items;
  }

  /**
   * 计算年龄（按本地日期，生日未到则减一）
   * @param birthDate 出生日期字符串（YYYY-MM-DD）
   * @returns 年龄或 null
   */
  private computeAge(birthDate: string | null): number | null {
    if (!birthDate) return null;
    const parts = birthDate.split('-').map((v) => Number(v));
    if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return null;
    const [year, month, day] = parts;
    const today = new Date();
    let age = today.getFullYear() - year;
    const hasBirthdayPassed =
      today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
    if (!hasBirthdayPassed) age -= 1;
    return age >= 0 ? age : null;
  }

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

  private compareRowOrder(left: AttendanceSheetRow, right: AttendanceSheetRow): number {
    const li = this.getStatusIndex(left.attendanceStatus);
    const ri = this.getStatusIndex(right.attendanceStatus);
    if (li !== ri) return li - ri;
    return left.enrollmentId - right.enrollmentId;
  }

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
