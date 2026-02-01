// src/usecases/course/sessions/list-sessions-by-coach.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import type { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachEntity } from '@src/modules/account/identities/training/coach/account-coach.entity';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListSessionsByCoachInput {
  readonly session: UsecaseSession;
  readonly statusFilter?: ReadonlyArray<SessionStatus>;
  readonly maxSessions?: number;
}

export interface ListSessionsByCoachItem {
  readonly session: CourseSessionEntity;
  readonly series: CourseSeriesEntity | null;
}

export interface ListSessionsByCoachOutput {
  readonly items: ReadonlyArray<ListSessionsByCoachItem>;
}

@Injectable()
export class ListSessionsByCoachUsecase {
  constructor(
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly seriesService: CourseSeriesService,
  ) {}

  /**
   * 按 coach 读取关联的节次列表，并补充 series 信息
   * @param input 用例输入
   * @returns 节次与开课班组合列表
   */
  async execute(input: ListSessionsByCoachInput): Promise<ListSessionsByCoachOutput> {
    this.assertCoachRole(input.session);
    const coach = await this.requireActiveCoach(input.session);

    const sessionIds = await this.sessionCoachesService.listSessionIdsByCoach({
      coachId: coach.id,
    });
    if (sessionIds.length === 0) {
      return { items: [] };
    }

    const sessions = await this.sessionsService.listByIds({
      ids: sessionIds,
      statusFilter: input.statusFilter,
      maxSessions: input.maxSessions,
    });
    if (sessions.length === 0) {
      return { items: [] };
    }

    const seriesIds = Array.from(new Set(sessions.map((item) => item.seriesId)));
    const seriesList = await this.seriesService.findManyByIds({ ids: seriesIds });
    const seriesMap = new Map(seriesList.map((item) => [item.id, item]));

    const items = sessions.map((session) => ({
      session,
      series: seriesMap.get(session.seriesId) ?? null,
    }));

    return { items };
  }

  /**
   * 校验当前会话是否为 coach 角色
   * @param session 用例会话
   */
  private assertCoachRole(session: UsecaseSession): void {
    const isCoach = hasRole(session.roles, IdentityTypeEnum.COACH);
    if (!isCoach) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [IdentityTypeEnum.COACH],
        userRoles: session.roles,
      });
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
}
