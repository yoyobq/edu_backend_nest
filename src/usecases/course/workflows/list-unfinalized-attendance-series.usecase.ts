// 文件位置： src/usecases/course/workflows/list-unfinalized-attendance-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import {
  ParticipationAttendanceService,
  type UnfinalizedAttendanceSeriesSummary,
} from '@src/modules/participation/attendance/participation-attendance.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListUnfinalizedAttendanceSeriesInput {
  readonly session: UsecaseSession;
}

export interface ListUnfinalizedAttendanceSeriesOutput {
  readonly items: ReadonlyArray<UnfinalizedAttendanceSeriesItem>;
}

export type UnfinalizedAttendanceSeriesItem = UnfinalizedAttendanceSeriesSummary & {
  readonly leadCoachName: string | null;
};

@Injectable()
export class ListUnfinalizedAttendanceSeriesUsecase {
  constructor(
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly sessionsService: CourseSessionsService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 执行未终审出勤关联的开课班列表查询
   * @param input 输入参数
   */
  async execute(
    input: ListUnfinalizedAttendanceSeriesInput,
  ): Promise<ListUnfinalizedAttendanceSeriesOutput> {
    this.ensurePermissions(input.session);
    const summaries = await this.attendanceService.listUnfinalizedSeriesSummaries();
    if (summaries.length === 0) {
      return { items: [] };
    }

    const seriesIds = summaries.map((item) => item.seriesId);
    const sessions = await this.sessionsService.listBySeriesIds({ seriesIds });
    const seriesLeadCoachMap = new Map<number, number>();
    sessions.forEach((session) => {
      if (!seriesLeadCoachMap.has(session.seriesId)) {
        seriesLeadCoachMap.set(session.seriesId, session.leadCoachId);
      }
    });

    const coachIds = Array.from(new Set(seriesLeadCoachMap.values()));
    const coachNameMap = new Map<number, string>();
    if (coachIds.length > 0) {
      const coachList = await Promise.all(
        coachIds.map(async (coachId) => {
          const coach = await this.coachService.findById(coachId);
          return coach ? { coachId, name: coach.name } : null;
        }),
      );
      coachList.forEach((coach) => {
        if (coach) coachNameMap.set(coach.coachId, coach.name);
      });
    }

    const items = summaries.map((summary) => ({
      ...summary,
      leadCoachName: coachNameMap.get(seriesLeadCoachMap.get(summary.seriesId) ?? -1) ?? null,
    }));

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
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看未终审出勤的开课班列表');
    }
  }
}
