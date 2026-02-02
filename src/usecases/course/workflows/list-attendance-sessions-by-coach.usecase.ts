// 文件位置： src/usecases/course/workflows/list-attendance-sessions-by-coach.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { ATTENDANCE_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListAttendanceSessionsByCoachInput {
  readonly session: UsecaseSession;
  readonly coachId: number;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
}

export interface ListAttendanceSessionsByCoachOutput {
  readonly items: ReadonlyArray<AttendanceSessionItem>;
}

export type AttendanceSessionItem = CourseSessionEntity & {
  readonly seriesTitle: string | null;
};

/**
 * 按时间段与 coachId 读取 attendance 关联的 session 列表用例
 */
@Injectable()
export class ListAttendanceSessionsByCoachUsecase {
  constructor(
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly coachService: CoachService,
    private readonly seriesService: CourseSeriesService,
  ) {}

  /**
   * 执行按时间段与 coachId 查询 session 列表
   * @param input 用例输入
   */
  async execute(
    input: ListAttendanceSessionsByCoachInput,
  ): Promise<ListAttendanceSessionsByCoachOutput> {
    this.ensureRangeValid(input.rangeStart, input.rangeEnd);
    await this.ensurePermissions(input.session, input.coachId);

    const sessionIds = await this.sessionCoachesService.listSessionIdsByCoach({
      coachId: input.coachId,
    });
    if (sessionIds.length === 0) {
      return { items: [] };
    }

    const matchedSessionIds =
      await this.attendanceService.listSessionIdsBySessionIdsAndStartTimeRange({
        sessionIds,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
      });
    if (matchedSessionIds.length === 0) {
      return { items: [] };
    }

    const sessions = await this.sessionsService.listByIds({ ids: matchedSessionIds });
    if (sessions.length === 0) {
      return { items: [] };
    }

    const seriesIds = Array.from(new Set(sessions.map((item) => item.seriesId)));
    const seriesList = await this.seriesService.findManyByIds({ ids: seriesIds });
    const seriesTitleMap = new Map(seriesList.map((item) => [item.id, item.title]));

    const items = sessions.map((session) => ({
      ...session,
      seriesId: session.seriesId,
      seriesTitle: seriesTitleMap.get(session.seriesId) ?? null,
    }));
    return { items };
  }

  /**
   * 校验当前会话是否具备所需权限
   * @param session 用例会话
   * @param coachId 目标 coachId
   */
  private async ensurePermissions(session: UsecaseSession, coachId: number): Promise<void> {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    const isCoach = hasRole(session.roles, IdentityTypeEnum.COACH);

    if (!isAdmin && !isManager && !isCoach) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [IdentityTypeEnum.ADMIN, IdentityTypeEnum.MANAGER, IdentityTypeEnum.COACH],
        userRoles: session.roles,
      });
    }

    if (isCoach && !isAdmin && !isManager) {
      const coach = await this.requireActiveCoach(session);
      if (coach.id !== coachId) {
        throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '仅允许查询本人关联节次', {
          coachId,
          currentCoachId: coach.id,
        });
      }
    }
  }

  /**
   * 读取并校验当前账号对应的激活 coach
   * @param session 用例会话
   * @returns coach 实体
   */
  private async requireActiveCoach(session: UsecaseSession): Promise<CoachEntity> {
    if (!session.accountId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 coach 身份');
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach || coach.deactivatedAt !== null) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定激活的 coach 身份');
    }
    return coach;
  }

  /**
   * 校验时间范围合法性
   * @param rangeStart 起始时间
   * @param rangeEnd 结束时间
   */
  private ensureRangeValid(rangeStart: Date, rangeEnd: Date): void {
    if (rangeStart.getTime() > rangeEnd.getTime()) {
      throw new DomainError(ATTENDANCE_ERROR.ATTENDANCE_INVALID_PARAMS, '时间范围不合法', {
        rangeStart,
        rangeEnd,
      });
    }
  }
}
