// 文件位置：src/usecases/course/sessions/generate-session-coaches-for-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource, EntityManager } from 'typeorm';

export interface GenerateSessionCoachesForSeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly maxSessions?: number;
}

export interface GenerateSessionCoachesForSeriesResult {
  readonly seriesId: number;
  readonly sessionsProcessed: number;
  readonly coachRelationsPlanned: number;
}

@Injectable()
export class GenerateSessionCoachesForSeriesUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 按指定系列批量生成节次教练关联
   * - 权限：仅 manager / admin 允许调用
   * - 范围：默认处理该系列下最多 200 条已排期节次
   * - 行为：基于节次的主教练与协助教练列表，为每个节次创建或复活对应的 session-coach 记录
   * @param input 用例输入参数
   * @returns 批处理结果统计信息
   */
  async execute(
    input: GenerateSessionCoachesForSeriesInput,
  ): Promise<GenerateSessionCoachesForSeriesResult> {
    const { session } = input;

    if (!session.roles || !hasRole(session.roles, IdentityTypeEnum.MANAGER)) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 manager / admin 可以生成节次教练关联',
        {
          seriesId: input.seriesId,
        },
      );
    }

    const series = await this.seriesService.findById(input.seriesId);
    if (!series) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }

    const maxSessions = input.maxSessions ?? 200;
    const sessions = await this.sessionsService.listAllBySeries({
      seriesId: input.seriesId,
      maxSessions,
      statusFilter: [SessionStatus.SCHEDULED],
    });

    if (sessions.length === 0) {
      return {
        seriesId: input.seriesId,
        sessionsProcessed: 0,
        coachRelationsPlanned: 0,
      };
    }

    const result = await this.dataSource.transaction(
      async (manager: EntityManager): Promise<GenerateSessionCoachesForSeriesResult> => {
        let coachRelationsPlanned = 0;

        for (const s of sessions) {
          const coachIds = new Set<number>();

          if (s.leadCoachId) {
            coachIds.add(s.leadCoachId);
          }

          if (s.extraCoachesJson && Array.isArray(s.extraCoachesJson)) {
            for (const extra of s.extraCoachesJson) {
              if (typeof extra.id === 'number') {
                coachIds.add(extra.id);
              }
            }
          }

          if (coachIds.size === 0) {
            continue;
          }

          for (const coachId of coachIds) {
            await this.sessionCoachesService.ensureActive({
              sessionId: s.id,
              coachId,
              operatorAccountId: session.accountId ?? null,
              manager,
            });
            coachRelationsPlanned++;
          }
        }

        return {
          seriesId: input.seriesId,
          sessionsProcessed: sessions.length,
          coachRelationsPlanned,
        };
      },
    );

    return result;
  }
}
