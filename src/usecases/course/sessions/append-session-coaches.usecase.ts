import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource, EntityManager } from 'typeorm';

export interface AppendSessionCoachesInput {
  readonly session: UsecaseSession;
  readonly sessionId: number;
  readonly coachIds: ReadonlyArray<number>;
}

export interface AppendSessionCoachesResult {
  readonly sessionId: number;
  readonly activatedCount: number;
}

@Injectable()
export class AppendSessionCoachesUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  async execute(input: AppendSessionCoachesInput): Promise<AppendSessionCoachesResult> {
    const { session } = input;

    const roles = session.roles ?? [];
    const isAdmin = hasRole(roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(roles, IdentityTypeEnum.MANAGER);
    if (!isAdmin && !isManager) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 manager / admin 可以追加节次教练 roster',
        {
          sessionId: input.sessionId,
        },
      );
    }

    const existingSession = await this.sessionsService.findById(input.sessionId);
    if (!existingSession) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在，无法追加教练', {
        sessionId: input.sessionId,
      });
    }

    const targetCoachIds = Array.from(
      new Set((input.coachIds ?? []).filter((id) => Number.isInteger(id) && id > 0)),
    );

    if (targetCoachIds.length === 0) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '目标教练列表不能为空', {
        sessionId: input.sessionId,
      });
    }

    const result = await this.dataSource.transaction(
      async (manager: EntityManager): Promise<AppendSessionCoachesResult> => {
        const existing = await this.sessionCoachesService.listRosterBySession({
          sessionId: input.sessionId,
          manager,
        });
        const existingMap = new Map<number, (typeof existing)[number]>(
          existing.map((row) => [row.coachId, row]),
        );

        let activatedCount = 0;

        for (const coachId of targetCoachIds) {
          const current = existingMap.get(coachId);
          const wasActive = current && current.removedAt === null;
          const wasRemoved = current && current.removedAt !== null;

          const updated = await this.sessionCoachesService.ensureActive({
            sessionId: input.sessionId,
            coachId,
            operatorAccountId: session.accountId ?? null,
            manager,
          });

          if (!current || wasRemoved || !wasActive) {
            activatedCount++;
          } else if (updated.updatedBy !== current.updatedBy) {
            activatedCount++;
          }
        }

        return {
          sessionId: input.sessionId,
          activatedCount,
        };
      },
    );

    return result;
  }
}
