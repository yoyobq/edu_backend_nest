import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import type { UsecaseSession } from '@src/types/auth/session.types';
import {
  ListSessionsBySeriesQuery,
  ListSessionsBySeriesUsecase,
} from './list-sessions-by-series.usecase';

export interface ListSessionCoachesBySeriesInput {
  readonly session: UsecaseSession;
  readonly query: ListSessionsBySeriesQuery;
}

export interface SessionCoachBrief {
  readonly id: number;
  readonly name: string;
  readonly level: number;
}

export interface SessionCoachesBySeriesItem {
  readonly sessionId: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly leadCoach: SessionCoachBrief | null;
  readonly assistantCoaches: ReadonlyArray<SessionCoachBrief>;
}

export interface ListSessionCoachesBySeriesResult {
  readonly items: ReadonlyArray<SessionCoachesBySeriesItem>;
}

@Injectable()
export class ListSessionCoachesBySeriesUsecase {
  constructor(
    private readonly listSessionsBySeriesUsecase: ListSessionsBySeriesUsecase,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    private readonly coachService: CoachService,
  ) {}

  async execute(
    input: ListSessionCoachesBySeriesInput,
  ): Promise<ListSessionCoachesBySeriesResult> {
    this.assertManagerOrAdmin(input.session);
    const sessions = await this.listSessionsBySeriesUsecase.execute(input.query);
    if (sessions.length === 0) {
      return { items: [] };
    }

    const rosterRows = await this.sessionCoachesService.listActiveRosterBySessionIds({
      sessionIds: sessions.map((item) => item.id),
    });

    const rosterMap = new Map<number, Set<number>>();
    for (const row of rosterRows) {
      const set = rosterMap.get(row.sessionId) ?? new Set<number>();
      set.add(row.coachId);
      rosterMap.set(row.sessionId, set);
    }

    const coachIds = Array.from(new Set(rosterRows.map((row) => row.coachId)));
    const coachMap = await this.loadCoachMap(coachIds);

    const items = sessions.map((session) =>
      this.buildItem(session, rosterMap.get(session.id), coachMap),
    );

    return { items };
  }

  private assertManagerOrAdmin(session: UsecaseSession): void {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    if (!isAdmin && !isManager) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [IdentityTypeEnum.ADMIN, IdentityTypeEnum.MANAGER],
        userRoles: session.roles,
      });
    }
  }

  private async loadCoachMap(
    coachIds: ReadonlyArray<number>,
  ): Promise<Map<number, SessionCoachBrief>> {
    if (coachIds.length === 0) {
      return new Map<number, SessionCoachBrief>();
    }

    const coaches = await Promise.all(
      coachIds.map(async (id) => {
        const coach = await this.coachService.findById(id);
        if (!coach) return null;
        return { id: coach.id, name: coach.name, level: coach.level };
      }),
    );

    return coaches.reduce<Map<number, SessionCoachBrief>>((map, coach) => {
      if (coach) {
        map.set(coach.id, coach);
      }
      return map;
    }, new Map<number, SessionCoachBrief>());
  }

  private buildItem(
    session: CourseSessionEntity,
    roster: Set<number> | undefined,
    coachMap: Map<number, SessionCoachBrief>,
  ): SessionCoachesBySeriesItem {
    const rosterIds = roster ? Array.from(roster) : [];
    const leadCoachId =
      rosterIds.length > 0 && roster?.has(session.leadCoachId) ? session.leadCoachId : null;
    const leadCoach = leadCoachId ? coachMap.get(leadCoachId) ?? null : null;
    const assistantIds = rosterIds.filter((id) => id !== session.leadCoachId);
    assistantIds.sort((a, b) => a - b);
    const assistantCoaches = assistantIds
      .map((id) => coachMap.get(id))
      .filter((coach): coach is SessionCoachBrief => Boolean(coach));

    return {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      leadCoach,
      assistantCoaches,
    };
  }
}
