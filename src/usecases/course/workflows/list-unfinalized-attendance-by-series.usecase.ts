// 文件位置： src/usecases/course/workflows/list-unfinalized-attendance-by-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { LearnerService } from '@src/modules/account/identities/training/learner/account-learner.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListUnfinalizedAttendanceBySeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
}

export interface ListUnfinalizedAttendanceBySeriesOutput {
  readonly items: ReadonlyArray<UnfinalizedAttendanceRecord>;
}

export type UnfinalizedAttendanceRecord = {
  readonly attendanceId: number;
  readonly sessionId: number;
  readonly sessionStartTime: Date;
  readonly enrollmentId: number;
  readonly learnerId: number;
  readonly learnerName: string;
  readonly status: ParticipationAttendanceStatus;
  readonly countApplied: string;
  readonly confirmedByCoachId: number | null;
  readonly confirmedByCoachName: string | null;
  readonly confirmedAt: Date | null;
  readonly remark: string | null;
};

@Injectable()
export class ListUnfinalizedAttendanceBySeriesUsecase {
  constructor(
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly sessionsService: CourseSessionsService,
    private readonly learnerService: LearnerService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 执行按 seriesId 查询未终审 attendance 列表
   * @param input 输入参数
   */
  async execute(
    input: ListUnfinalizedAttendanceBySeriesInput,
  ): Promise<ListUnfinalizedAttendanceBySeriesOutput> {
    this.ensurePermissions(input.session);
    const sessions = await this.sessionsService.listBySeriesAndUntilDate({
      seriesId: input.seriesId,
    });
    if (sessions.length === 0) {
      return { items: [] };
    }

    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const sessionIds = sessions.map((s) => s.id);
    const records = await this.attendanceService.listUnfinalizedRecordsBySessionIds({
      sessionIds,
    });
    if (records.length === 0) {
      return { items: [] };
    }

    const learnerIds = Array.from(new Set(records.map((item) => item.learnerId)));
    const learners = await this.learnerService.findManyByIds({ ids: learnerIds });
    const learnerNameMap = new Map(learners.map((item) => [item.id, item.name]));

    const coachAccountIds = Array.from(
      new Set(
        records
          .map((item) => item.confirmedByCoachId)
          .filter((value): value is number => value !== null),
      ),
    );
    const coachNameMap = new Map<number, string>();
    if (coachAccountIds.length > 0) {
      const coachList = await Promise.all(
        coachAccountIds.map(async (accountId) => {
          const coach = await this.coachService.findByAccountId(accountId);
          return coach ? { accountId, name: coach.name } : null;
        }),
      );
      coachList.forEach((coach) => {
        if (coach) coachNameMap.set(coach.accountId, coach.name);
      });
    }

    const items = records.map((record) => ({
      attendanceId: record.attendanceId,
      sessionId: record.sessionId,
      sessionStartTime: sessionMap.get(record.sessionId)?.startTime ?? new Date(0),
      enrollmentId: record.enrollmentId,
      learnerId: record.learnerId,
      learnerName: learnerNameMap.get(record.learnerId) ?? '',
      status: record.status,
      countApplied: record.countApplied,
      confirmedByCoachId: record.confirmedByCoachId,
      confirmedByCoachName:
        record.confirmedByCoachId === null
          ? null
          : (coachNameMap.get(record.confirmedByCoachId) ?? null),
      confirmedAt: record.confirmedAt,
      remark: record.remark,
    }));

    items.sort((a, b) => {
      const timeDiff = a.sessionStartTime.getTime() - b.sessionStartTime.getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.sessionId !== b.sessionId) return a.sessionId - b.sessionId;
      return a.attendanceId - b.attendanceId;
    });
    return { items };
  }

  /**
   * 校验权限：仅允许 admin / manager
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const ok =
      hasRole(session.roles, IdentityTypeEnum.ADMIN) ||
      hasRole(session.roles, IdentityTypeEnum.MANAGER);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看未终审出勤记录列表');
    }
  }
}
