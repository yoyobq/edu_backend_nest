// src/usecases/course/sessions/list-sessions-by-series.usecase.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import { Injectable } from '@nestjs/common';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';

export type ListSessionsBySeriesMode = 'RECENT_WINDOW' | 'ALL';

export type ListSessionsBySeriesQuery =
  | {
      readonly mode: 'RECENT_WINDOW';
      readonly seriesId: number;
      readonly baseTime: Date;
      readonly pastLimit: number;
      readonly futureLimit: number;
      readonly statusFilter?: ReadonlyArray<SessionStatus>;
    }
  | {
      readonly mode: 'ALL';
      readonly seriesId: number;
      readonly maxSessions: number;
      readonly statusFilter?: ReadonlyArray<SessionStatus>;
    };

/**
 * 按开课班（CourseSeries）读取节次列表用例（纯读）
 *
 * 这是一个薄 usecase：仅负责根据模式调用 CourseSessionsService 的读方法。
 */
@Injectable()
export class ListSessionsBySeriesUsecase {
  constructor(private readonly sessionsService: CourseSessionsService) {}

  /**
   * 按开课班（CourseSeries）读取节次列表
   * @param query 查询参数
   * @returns 节次实体列表
   */
  async execute(query: ListSessionsBySeriesQuery): Promise<CourseSessionEntity[]> {
    return await this.executeQuery(query);
  }

  /**
   * 根据查询模式执行底层查询
   * @param query 查询参数
   * @returns 节次实体列表
   */
  private async executeQuery(query: ListSessionsBySeriesQuery): Promise<CourseSessionEntity[]> {
    if (query.mode === 'RECENT_WINDOW') {
      return await this.sessionsService.listRecentWindowBySeries({
        seriesId: query.seriesId,
        baseTime: query.baseTime,
        pastLimit: query.pastLimit,
        futureLimit: query.futureLimit,
        statusFilter: query.statusFilter,
      });
    }
    return await this.sessionsService.listAllBySeries({
      seriesId: query.seriesId,
      maxSessions: query.maxSessions,
      statusFilter: query.statusFilter,
    });
  }
}
