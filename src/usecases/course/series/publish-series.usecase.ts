// src/usecases/course/series/publish-series.usecase.ts
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
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
import { computeSeriesScheduleHash } from '@src/modules/common/utils/series-schedule-hash.util';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

export interface PublishSeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly selectedKeys?: ReadonlyArray<string>;
  readonly previewHash: string;
  readonly dryRun?: boolean;
  readonly leadCoachId?: number;
}

export interface PublishSeriesOutput {
  readonly series: { id: number; status: CourseSeriesStatus; publishedAt?: string | null };
  readonly createdSessions: number;
}

@Injectable()
export class PublishSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly coachService: CoachService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * 执行发布课程系列（精简版）
   * 仅支持根据 recurrenceRule 自动生成节次并发布为 PUBLISHED；可选 dryRun。
   */
  async execute(input: PublishSeriesInput): Promise<PublishSeriesOutput> {
    const { session, seriesId, selectedKeys, previewHash, dryRun } = input;
    this.requireAuthorized(session);
    const series = await this.loadSeriesOrThrow(seriesId);
    await this.requireOwnership(session, series);

    const currentHash = computeSeriesScheduleHash(series, 'v1');
    if (currentHash !== previewHash) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '预览内容已过期，请重新预览后再发布',
      );
    }

    const occurrences = this.recomputeOccurrences(series);
    const toCreate = this.filterBySelectedKeys(occurrences, selectedKeys);

    const leadCoachId = await this.resolveLeadCoachId({
      series,
      selectedLeadCoachId: input.leadCoachId,
    });

    if (toCreate.length === 0 && dryRun !== true) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '发布必须至少包含 1 个节次');
    }

    if (dryRun === true) {
      return {
        series: { id: series.id, status: series.status, publishedAt: null },
        createdSessions: 0,
      };
    }
    let created = 0;
    const publishedAt = new Date().toISOString();
    await this.dataSource.transaction(async (manager) => {
      const items = toCreate.map((occ) => ({
        seriesId: series.id,
        startTime: occ.startTime,
        endTime: occ.endTime,
        leadCoachId,
        locationText: '馆内',
        remark: null,
      }));

      const res = await this.sessionsService.bulkCreate({ items, manager });
      created = res.created;

      const updateRes = await manager
        .getRepository(CourseSeriesEntity)
        .update(
          { id: series.id, status: CourseSeriesStatus.PLANNED },
          { status: CourseSeriesStatus.PUBLISHED },
        );
      if ((updateRes.affected ?? 0) !== 1) {
        throw new DomainError(
          COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED,
          '系列状态已被其他流程更新，当前发布操作被拒绝',
        );
      }

      const envelope = buildEnvelope({
        type: 'SeriesPublished',
        aggregateType: 'series',
        aggregateId: series.id,
        dedupKey: `SeriesPublished:${series.id}`,
        priority: 6,
        payload: {
          seriesId: series.id,
          createdSessions: created,
          publishedAt,
        },
      });
      await this.outboxWriter.enqueue({ envelope });
    });

    return {
      series: { id: series.id, status: CourseSeriesStatus.PUBLISHED, publishedAt },
      createdSessions: created,
    };
  }

  /**
   * 解析主教练 ID：
   * - 系列由教练发布：主教练固定为该教练（忽略外部选择）；
   * - 系列由经理/管理员发布：必须提供主教练 ID 并验证存在。
   */
  private async resolveLeadCoachId(input: {
    readonly series: CourseSeriesEntity;
    readonly selectedLeadCoachId?: number;
  }): Promise<number> {
    if (input.series.publisherType === PublisherType.COACH) {
      return input.series.publisherId;
    }
    const chosen = input.selectedLeadCoachId;
    if (!chosen || chosen <= 0) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '请指定主教练');
    }
    const coach = await this.coachService.findById(chosen);
    if (!coach) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '主教练不存在');
    }
    return coach.id;
  }

  /**
   * 鉴权：仅允许 ADMIN / MANAGER / COACH 角色发布
   */
  private requireAuthorized(session: UsecaseSession): void {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const ok = roles.includes('ADMIN') || roles.includes('MANAGER') || roles.includes('COACH');
    if (!ok) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权发布开课班');
  }

  /**
   * 加载系列并进行状态校验：必须存在且为 PLANNED
   */
  private async loadSeriesOrThrow(seriesId: number): Promise<CourseSeriesEntity> {
    const found = await this.seriesService.findById(seriesId);
    if (!found) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '系列不存在');
    }
    if (found.status !== CourseSeriesStatus.PLANNED) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持发布');
    }
    return found;
  }

  /**
   * 所有权校验：
   * - manager/admin 可以发布任何系列；
   * - coach 仅能发布自己作为 publisher 的系列。
   */
  private async requireOwnership(
    session: UsecaseSession,
    series: CourseSeriesEntity,
  ): Promise<void> {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const isAdmin = roles.includes('ADMIN');
    const isManager = roles.includes('MANAGER');
    const isCoach = roles.includes('COACH');
    if (isAdmin || isManager) return;
    if (isCoach) {
      const coach = await this.coachService.findByAccountId(session.accountId);
      if (!coach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
      }
      const owned = series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
      if (!owned) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权发布该开课班');
      }
      return;
    }
    throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权发布开课班');
  }

  /**
   * 复算 occurrence（占位实现）：按 startDate→endDate 每天一节，时长固定 60 分钟
   * TODO: 使用与 PreviewSeriesScheduleUsecase 相同的 RecurrenceEngine 实现
   */
  private recomputeOccurrences(series: CourseSeriesEntity): ReadonlyArray<{
    key: string;
    startTime: Date;
    endTime: Date;
  }> {
    const rule = (series.recurrenceRule ?? '').trim();
    if (!rule) return [];
    const hour = this.extractHour(rule);
    const minute = this.extractMinute(rule);
    const start = this.parseDate(series.startDate);
    const end = this.parseDate(series.endDate);
    const items: { key: string; startTime: Date; endTime: Date }[] = [];
    for (
      let d = new Date(start.getTime());
      d.getTime() <= end.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      items.push({ key: this.computeOccurrenceKey(s), startTime: s, endTime: e });
    }
    return items;
  }

  /**
   * 过滤 occurrence：undefined=全部；空数组=[]=不创建；否则按 key 过滤
   */
  private filterBySelectedKeys(
    occurrences: ReadonlyArray<{ key: string; startTime: Date; endTime: Date }>,
    selectedKeys?: ReadonlyArray<string>,
  ): ReadonlyArray<{ startTime: Date; endTime: Date }> {
    if (selectedKeys === undefined) {
      return occurrences.map((o) => ({ startTime: o.startTime, endTime: o.endTime }));
    }
    if (selectedKeys.length === 0) {
      return [];
    }
    const set = new Set(selectedKeys);
    return occurrences
      .filter((o) => set.has(o.key))
      .map((o) => ({ startTime: o.startTime, endTime: o.endTime }));
  }

  /**
   * 生成 occurrence key：YYYY-MM-DDTHH:mm#v1
   */
  private computeOccurrenceKey(dt: Date): string {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}#v1`;
  }

  /**
   * 解析日期字符串（YYYY-MM-DD）为 Date
   */
  private parseDate(s: string): Date {
    const [y, m, d] = s.split('-').map((t) => Number(t));
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  /**
   * 从规则中提取小时（默认 9 点）
   */
  private extractHour(rule: string): number {
    const m = /BYHOUR=(\d{1,2})/i.exec(rule);
    return m ? Number(m[1]) : 9;
  }

  /**
   * 从规则中提取分钟（默认 0 分）
   */
  private extractMinute(rule: string): number {
    const m = /BYMINUTE=(\d{1,2})/i.exec(rule);
    return m ? Number(m[1]) : 0;
  }
}
