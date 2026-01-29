// 文件位置：src/usecases/course/series/apply-series-schedule.usecase.ts
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { computeSeriesScheduleHash } from '@src/modules/common/utils/series-schedule-hash.util';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface ApplySeriesScheduleInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly selectedKeys?: ReadonlyArray<string>;
  readonly previewHash: string;
  readonly dryRun?: boolean;
  readonly customSessions?: ReadonlyArray<{
    readonly startTime: Date;
    readonly endTime: Date;
    readonly locationText?: string;
    readonly remark?: string | null;
  }>;
  readonly leadCoachId?: number;
}

export interface ApplySeriesScheduleOutput {
  readonly seriesId: number;
  readonly createdSessions: number;
}

@Injectable()
export class ApplySeriesScheduleUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly coachService: CoachService,
  ) {}

  async execute(input: ApplySeriesScheduleInput): Promise<ApplySeriesScheduleOutput> {
    const { session, seriesId, selectedKeys, previewHash, dryRun } = input;
    this.requireAuthorized(session);
    const series = await this.loadSeriesOrThrow(seriesId);
    await this.requireOwnership(session, series);

    const currentHash = computeSeriesScheduleHash(series, 'v1');
    if (currentHash !== previewHash) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '预览内容已过期，请重新预览后再应用排期',
      );
    }

    const occurrences = this.recomputeOccurrences(series);
    const toCreate = this.filterBySelectedKeys(occurrences, selectedKeys);
    const customSessions = input.customSessions ?? [];
    this.validateCustomSessionsOrThrow(series, customSessions, toCreate);

    const leadCoachId = await this.resolveLeadCoachId({
      series,
      selectedLeadCoachId: input.leadCoachId,
    });

    if (toCreate.length === 0 && customSessions.length === 0 && dryRun !== true) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '排期必须至少包含 1 个节次');
    }

    if (dryRun === true) {
      return {
        seriesId: series.id,
        createdSessions: 0,
      };
    }

    const leaveCutoffHoursOverride = series.leaveCutoffHours ?? 12;
    const items = [
      ...toCreate.map((occ) => ({
        seriesId: series.id,
        startTime: occ.startTime,
        endTime: occ.endTime,
        leadCoachId,
        locationText: '馆内',
        leaveCutoffHoursOverride,
        remark: null,
      })),
      ...customSessions.map((s) => ({
        seriesId: series.id,
        startTime: s.startTime,
        endTime: s.endTime,
        leadCoachId,
        locationText: s.locationText?.trim() ? s.locationText.trim() : '馆内',
        leaveCutoffHoursOverride,
        remark: s.remark ?? null,
      })),
    ].sort((a, b) => {
      const startDiff = a.startTime.getTime() - b.startTime.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = a.endTime.getTime() - b.endTime.getTime();
      if (endDiff !== 0) return endDiff;
      return String(a.locationText).localeCompare(String(b.locationText), 'zh-Hans');
    });

    const res = await this.sessionsService.bulkCreate({ items });

    if (series.status !== CourseSeriesStatus.SCHEDULED) {
      await this.seriesService.update(series.id, { status: CourseSeriesStatus.SCHEDULED });
    }

    return {
      seriesId: series.id,
      createdSessions: res.created,
    };
  }

  /**
   * 解析主教练 ID：
   * - 系列由教练发布：主教练固定为该教练；
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
   * 鉴权：仅允许 ADMIN / MANAGER / COACH 角色应用排期
   */
  private requireAuthorized(session: UsecaseSession): void {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const ok = roles.includes('ADMIN') || roles.includes('MANAGER') || roles.includes('COACH');
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权应用开课班排期');
    }
  }

  private async loadSeriesOrThrow(seriesId: number): Promise<CourseSeriesEntity> {
    const found = await this.seriesService.findById(seriesId);
    if (!found) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '系列不存在');
    }
    if (
      found.status !== CourseSeriesStatus.DRAFT &&
      found.status !== CourseSeriesStatus.SCHEDULED
    ) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持应用排期');
    }
    return found;
  }

  /**
   * 所有权校验：
   * - manager/admin 可以操作任何系列；
   * - coach 仅能操作自己作为 publisher 的系列。
   */
  private async requireOwnership(
    session: UsecaseSession,
    series: CourseSeriesEntity,
  ): Promise<void> {
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const isAdmin = roles.includes('ADMIN');
    const isManager = roles.includes('MANAGER');
    const isCoach = roles.includes('COACH');
    if (isAdmin || isManager) {
      return;
    }
    if (isCoach) {
      const coach = await this.coachService.findByAccountId(session.accountId);
      if (!coach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
      }
      const owned = series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
      if (!owned) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权操作该开课班');
      }
      return;
    }
    throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权操作该开课班');
  }

  /**
   * 复算 occurrence（占位实现）：按 startDate→endDate 每天一节，时长固定 60 分钟
   */
  private recomputeOccurrences(series: CourseSeriesEntity): ReadonlyArray<{
    key: string;
    startTime: Date;
    endTime: Date;
  }> {
    const rule = (series.recurrenceRule ?? '').trim();
    if (!rule) {
      return [];
    }
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
   * 校验自定义课次列表
   */
  private validateCustomSessionsOrThrow(
    series: CourseSeriesEntity,
    customSessions: ReadonlyArray<{
      readonly startTime: Date;
      readonly endTime: Date;
      readonly locationText?: string;
      readonly remark?: string | null;
    }>,
    scheduled: ReadonlyArray<{ startTime: Date; endTime: Date }>,
  ): void {
    if (customSessions.length === 0) {
      return;
    }

    const rangeStart = this.parseDate(series.startDate);
    const rangeEnd = this.endOfDate(series.endDate);
    const scheduledStartTimes = new Set(scheduled.map((s) => s.startTime.getTime()));
    const customStartTimes = new Set<number>();

    for (const s of customSessions) {
      this.assertCustomSessionTimeOrThrow(s);
      this.assertCustomSessionInRangeOrThrow(s, rangeStart, rangeEnd);
      this.assertCustomSessionUniqueStartOrThrow(s, scheduledStartTimes, customStartTimes);
    }
  }

  /**
   * 校验自定义课次的开始结束时间
   */
  private assertCustomSessionTimeOrThrow(input: {
    readonly startTime: Date;
    readonly endTime: Date;
  }): void {
    const st = input.startTime?.getTime?.();
    const et = input.endTime?.getTime?.();
    if (!Number.isFinite(st) || !Number.isFinite(et)) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '临时课次时间无效');
    }
    if (Number(st) >= Number(et)) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '临时课次开始时间必须早于结束时间');
    }
  }

  /**
   * 校验自定义课次是否位于开班日期范围内
   */
  private assertCustomSessionInRangeOrThrow(
    input: { readonly startTime: Date; readonly endTime: Date },
    rangeStart: Date,
    rangeEnd: Date,
  ): void {
    const startTime = input.startTime.getTime();
    const endTime = input.endTime.getTime();
    const startOk = startTime >= rangeStart.getTime() && startTime <= rangeEnd.getTime();
    const endOk = endTime >= rangeStart.getTime() && endTime <= rangeEnd.getTime();
    if (!startOk || !endOk) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '临时课次不在开班日期范围内');
    }
  }

  /**
   * 校验自定义课次开始时间不与已排期或其他临时课重复
   */
  private assertCustomSessionUniqueStartOrThrow(
    input: { readonly startTime: Date },
    scheduledStartTimes: ReadonlySet<number>,
    customStartTimes: Set<number>,
  ): void {
    const key = input.startTime.getTime();
    if (scheduledStartTimes.has(key)) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '临时课次与规则课次存在重复开始时间',
      );
    }
    if (customStartTimes.has(key)) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '临时课次列表存在重复开始时间');
    }
    customStartTimes.add(key);
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
   * 计算日期的结束时间
   */
  private endOfDate(s: string): Date {
    const d = this.parseDate(s);
    d.setHours(23, 59, 59, 999);
    return d;
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
