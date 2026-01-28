// 文件位置：src/usecases/course/sessions/sync-session-coaches-roster.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionCoachEntity } from '@src/modules/course/session-coaches/course-session-coach.entity';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource, EntityManager } from 'typeorm';

export interface SyncSessionCoachesRosterInput {
  readonly session: UsecaseSession;
  readonly sessionId: number;
  readonly coachIds: ReadonlyArray<number>;
  readonly removedReason?: SessionCoachRemovedReason;
}

export interface SyncSessionCoachesRosterResult {
  readonly sessionId: number;
  readonly activatedCount: number;
  readonly removedCount: number;
}

@Injectable()
export class SyncSessionCoachesRosterUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 同步单节次的教练 roster 到指定教练集合
   * - 权限：仅 manager / admin 允许调用
   * - 行为：将节次的结算教练集合整体覆盖为 target coachIds
   *   - 在目标集合内：
   *     - 不存在记录：创建一条 active 记录
   *     - 存在且已移出：复活为 active
   *     - 已是 active：保持不变，仅按需更新操作人
   *   - 不在目标集合内：
   *     - 若存在记录：标记移出（removedAt 等），removedReason 默认 REPLACED
   * - 事务：在单事务内完成，确保 roster 变更原子性
   * @param input 用例输入参数
   * @returns 本次激活与移出记录的数量统计
   */
  async execute(input: SyncSessionCoachesRosterInput): Promise<SyncSessionCoachesRosterResult> {
    const { session } = input;

    const roles = session.roles ?? [];
    const isAdmin = hasRole(roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(roles, IdentityTypeEnum.MANAGER);
    if (!isAdmin && !isManager) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 manager / admin 可以同步节次教练 roster',
        {
          sessionId: input.sessionId,
        },
      );
    }

    const existingSession = await this.sessionsService.findById(input.sessionId);
    if (!existingSession) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在，无法同步教练 roster', {
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

    const removedReason = input.removedReason ?? SessionCoachRemovedReason.REPLACED;

    const result = await this.dataSource.transaction(
      async (manager: EntityManager): Promise<SyncSessionCoachesRosterResult> => {
        const repo = manager.getRepository(CourseSessionCoachEntity);

        const existing = await repo.find({
          where: { sessionId: input.sessionId },
        });

        const existingMap = new Map<number, (typeof existing)[number]>();
        for (const row of existing) {
          existingMap.set(row.coachId, row);
        }

        let activatedCount = 0;
        let removedCount = 0;

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

        const targetSet = new Set(targetCoachIds);
        for (const row of existing) {
          if (!targetSet.has(row.coachId) && row.removedAt === null) {
            await this.sessionCoachesService.removeFromRoster({
              sessionId: input.sessionId,
              coachId: row.coachId,
              operatorAccountId: session.accountId ?? null,
              removedReason,
              manager,
            });
            removedCount++;
          }
        }

        return {
          sessionId: input.sessionId,
          activatedCount,
          removedCount,
        };
      },
    );

    return result;
  }
}
