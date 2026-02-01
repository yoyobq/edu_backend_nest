// src/usecases/course/payout/update-series.usecase.ts
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

/**
 * 更新开课班用例
 *
 * 负责执行开课班的更新操作：按 ID 更新允许的字段。
 */
@Injectable()
export class UpdateSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

  private hasRole(session: UsecaseSession, role: string): boolean {
    return (session.roles ?? []).some((r) => String(r).toUpperCase() === role);
  }

  private async assertCanUpdate(
    session: UsecaseSession,
    series: CourseSeriesEntity,
  ): Promise<void> {
    const isAdmin = this.hasRole(session, 'ADMIN');
    const isManager = this.hasRole(session, 'MANAGER');
    const isCoach = this.hasRole(session, 'COACH');

    if (!isAdmin && !isManager && !isCoach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权更新开课班');
    }

    if (isAdmin || isManager) return;

    if (
      series.status !== CourseSeriesStatus.DRAFT &&
      series.status !== CourseSeriesStatus.SCHEDULED
    ) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅允许更新未发布的开课班');
    }

    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
    }

    const owned = series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
    if (!owned) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权更新该开课班');
    }
  }

  /**
   * 执行更新开课班
   * @param args 更新参数对象
   * @returns 更新后的开课班实体
   */
  async execute(args: {
    readonly session: UsecaseSession;
    readonly id: number;
    readonly data: Partial<CourseSeriesEntity>;
  }): Promise<CourseSeriesEntity> {
    try {
      const series = await this.seriesService.findById(args.id);
      if (!series) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }

      await this.assertCanUpdate(args.session, series);

      const patch = { ...args.data };
      if (args.session.accountId) {
        patch.updatedBy = args.session.accountId;
      }

      const updated = await this.seriesService.update(args.id, patch);
      if (!updated) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED, '更新开课班失败', {
        error,
      });
    }
  }
}

@Injectable()
export class CloseSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 判断会话是否包含指定角色
   * @param session 会话信息
   * @param role 角色名称
   */
  private hasRole(session: UsecaseSession, role: string): boolean {
    return (session.roles ?? []).some((r) => String(r).toUpperCase() === role);
  }

  /**
   * 校验封班权限
   * @param session 会话信息
   * @param series 开课班实体
   */
  private async assertCanClose(session: UsecaseSession, series: CourseSeriesEntity): Promise<void> {
    const isAdmin = this.hasRole(session, 'ADMIN');
    const isManager = this.hasRole(session, 'MANAGER');
    const isCoach = this.hasRole(session, 'COACH');

    if (!isAdmin && !isManager && !isCoach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权封班');
    }

    if (isAdmin || isManager) return;

    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
    }

    const owned = series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
    if (!owned) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权封班该开课班');
    }
  }

  /**
   * 执行封班
   * @param args 封班参数对象
   * @returns 更新后的开课班实体
   */
  async execute(args: {
    readonly session: UsecaseSession;
    readonly id: number;
    readonly reason?: string | null;
  }): Promise<CourseSeriesEntity> {
    try {
      const series = await this.seriesService.findById(args.id);
      if (!series) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }

      await this.assertCanClose(args.session, series);

      if (series.status === CourseSeriesStatus.CLOSED) {
        return series;
      }

      if (
        series.status !== CourseSeriesStatus.SCHEDULED &&
        series.status !== CourseSeriesStatus.PUBLISHED &&
        series.status !== CourseSeriesStatus.PENDING_APPROVAL
      ) {
        throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持封班');
      }

      const patch: Partial<CourseSeriesEntity> = { status: CourseSeriesStatus.CLOSED };
      const normalizedReason = args.reason?.trim();
      if (normalizedReason) {
        const prefix = '封班原因：';
        patch.remark = series.remark
          ? `${series.remark}\n${prefix}${normalizedReason}`
          : `${prefix}${normalizedReason}`;
      }
      if (args.session.accountId) {
        patch.updatedBy = args.session.accountId;
      }

      const updated = await this.seriesService.update(args.id, patch);
      if (!updated) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED, '封班失败', { error });
    }
  }
}

export interface ApproveSeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
}

export interface ApproveSeriesOutput {
  readonly series: { id: number; status: CourseSeriesStatus; publishedAt: string | null };
  readonly createdSessions: number;
}

@Injectable()
export class ApproveSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private requireAuthorized(session: UsecaseSession): void {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const ok = roles.includes('ADMIN') || roles.includes('MANAGER');
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权审批开课班');
    }
  }

  async execute(input: ApproveSeriesInput): Promise<ApproveSeriesOutput> {
    const { session, seriesId } = input;
    this.requireAuthorized(session);
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }
    if (series.status !== CourseSeriesStatus.PENDING_APPROVAL) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持审批通过');
    }

    const sessionCount = await this.sessionsService.countBySeries(series.id);
    if (sessionCount <= 0) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '当前系列尚未生成任何节次，无法审批通过',
      );
    }

    const publishedAt = new Date().toISOString();
    await this.dataSource.transaction(async (manager) => {
      const patch: Partial<CourseSeriesEntity> = { status: CourseSeriesStatus.PUBLISHED };
      if (session.accountId) {
        patch.updatedBy = session.accountId;
      }
      const updateRes = await manager
        .getRepository(CourseSeriesEntity)
        .update({ id: series.id, status: CourseSeriesStatus.PENDING_APPROVAL }, patch);
      if ((updateRes.affected ?? 0) !== 1) {
        throw new DomainError(
          COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED,
          '系列状态已被其他流程更新，当前审批操作被拒绝',
        );
      }

      const sessions = await manager
        .getRepository(CourseSessionEntity)
        .createQueryBuilder('s')
        .select('s')
        .where('s.seriesId = :seriesId', { seriesId: series.id })
        .andWhere('s.status = :status', { status: SessionStatus.SCHEDULED })
        .orderBy('s.startTime', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .limit(200)
        .getMany();

      for (const s of sessions) {
        const coachIds = new Set<number>();
        if (s.leadCoachId) {
          coachIds.add(s.leadCoachId);
        }
        if (Array.isArray(s.extraCoachesJson)) {
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
        }
      }

      const envelope = buildEnvelope({
        type: 'SeriesPublished',
        aggregateType: 'series',
        aggregateId: series.id,
        dedupKey: `SeriesPublished:${series.id}`,
        priority: 6,
        payload: {
          seriesId: series.id,
          createdSessions: sessionCount,
          publishedAt,
        },
      });
      await this.outboxWriter.enqueue({ envelope });
    });

    return {
      series: { id: series.id, status: CourseSeriesStatus.PUBLISHED, publishedAt },
      createdSessions: sessionCount,
    };
  }
}

export interface RejectSeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly reason?: string | null;
}

@Injectable()
export class RejectSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private requireAuthorized(session: UsecaseSession): void {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const ok = roles.includes('ADMIN') || roles.includes('MANAGER');
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权驳回开课班');
    }
  }

  async execute(input: RejectSeriesInput): Promise<CourseSeriesEntity> {
    const { session, seriesId, reason } = input;
    this.requireAuthorized(session);
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }
    if (series.status !== CourseSeriesStatus.PENDING_APPROVAL) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持驳回');
    }

    const normalizedReason = reason?.trim();
    const patch: Partial<CourseSeriesEntity> = { status: CourseSeriesStatus.SCHEDULED };
    if (normalizedReason) {
      const prefix = '驳回原因：';
      patch.remark = series.remark
        ? `${series.remark}\n${prefix}${normalizedReason}`
        : `${prefix}${normalizedReason}`;
    }
    if (session.accountId) {
      patch.updatedBy = session.accountId;
    }

    await this.dataSource.transaction(async (manager) => {
      const updateRes = await manager
        .getRepository(CourseSeriesEntity)
        .update({ id: series.id, status: CourseSeriesStatus.PENDING_APPROVAL }, patch);
      if ((updateRes.affected ?? 0) !== 1) {
        throw new DomainError(
          COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED,
          '系列状态已被其他流程更新，当前驳回操作被拒绝',
        );
      }
    });

    const updated = await this.seriesService.findById(series.id);
    if (!updated) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
    }
    return updated;
  }
}
