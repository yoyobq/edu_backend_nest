// 文件位置：src/usecases/course/series/preview-series-schedule.usecase.ts
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * Occurrence 预览项
 * 表示一次课程节次的预生成信息（仅内存，不写入 DB）
 */
export interface PreviewOccurrence {
  /** 开始时间（本地时区） */
  startDateTime: Date;
  /** 结束时间（本地时区） */
  endDateTime: Date;
  /** 日期字符串（YYYY-MM-DD） */
  date: string;
  /** 星期索引（1=周一 … 7=周日） */
  weekdayIndex: number;
  /** 可选的冲突信息（当前暂未实现冲突查询时为 null） */
  conflict: null | {
    /** 是否存在时间冲突 */
    hasConflict: boolean;
    /** 冲突详情（如已有节次数量） */
    count: number;
  };
}

/**
 * 预览输出类型
 */
export interface PreviewSeriesScheduleOutput {
  /** 目标系列 */
  series: CourseSeriesEntity;
  /** 预览的节次列表（仅内存，不写 DB） */
  occurrences: ReadonlyArray<PreviewOccurrence>;
}

/**
 * 预览选项
 */
export interface PreviewOptions {
  /** 是否启用冲突检查（默认 true） */
  enableConflictCheck?: boolean;
  /** 默认课时长度（分钟，默认 60） */
  defaultDurationMinutes?: number;
}

@Injectable()
export class PreviewSeriesScheduleUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly sessionsService: CourseSessionsService,
    private readonly coachService: CoachService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行课程系列排期预览
   * 用途：在内存中根据 start_date / end_date / recurrence_rule 计算出将要生成的节次列表。
   * 特点：纯读 + 纯计算，不写入 DB，不改 series 状态，不写 Outbox。
   * @param params 入参对象（session/seriesId/options）
   * @returns 预览输出（系列 + occurrence 列表）
   */
  async execute(params: {
    readonly session: UsecaseSession;
    readonly seriesId: number;
    readonly options?: PreviewOptions;
  }): Promise<PreviewSeriesScheduleOutput> {
    const { session, seriesId, options } = params;

    this.requireAuthorized(session);
    const series = await this.requireSeries(seriesId);
    this.requireStatusPlanned(series);
    await this.requireOwnership(session, series);

    const { start, end } = this.parseAndValidateDates(series.startDate, series.endDate);
    this.validateRecurrenceRuleMaybe(series.recurrenceRule);

    const occurrences = this.generateOccurrences(series, start, end, {
      durationMinutes: options?.defaultDurationMinutes ?? 60,
      enableConflictCheck: options?.enableConflictCheck ?? true,
    });

    if (options?.enableConflictCheck ?? true) {
      await this.applyConflictDetection(series, occurrences as PreviewOccurrence[]);
    }

    return { series, occurrences };
  }

  /**
   * 角色鉴权：允许 ADMIN / MANAGER / COACH
   * @param session 当前会话
   */
  private requireAuthorized(session: UsecaseSession): void {
    const ok = this.isAdmin(session) || this.isManager(session) || this.isCoach(session);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '缺少查看课程排期预览的权限');
    }
  }

  /**
   * 身份判别：是否为 ADMIN
   */
  private isAdmin(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'ADMIN') ?? false;
  }

  /**
   * 身份判别：是否为 MANAGER
   */
  private isManager(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'MANAGER') ?? false;
  }

  /**
   * 身份判别：是否为 COACH
   */
  private isCoach(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'COACH') ?? false;
  }

  /**
   * 加载目标系列（不存在则抛错）
   * @param id 系列 ID
   */
  private async requireSeries(id: number): Promise<CourseSeriesEntity> {
    const s = await this.seriesService.findById(id);
    if (!s) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '课程系列不存在');
    }
    return s;
  }

  /**
   * 状态校验：当前仅允许 PLANNED 做预览
   * @param s 系列实体
   */
  private requireStatusPlanned(s: CourseSeriesEntity): void {
    if (s.status !== CourseSeriesStatus.PLANNED) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '当前状态不支持排期预览');
    }
  }

  /**
   * 所有权校验：
   * - coach 仅可预览自己发布的系列；
   * - manager/admin 可预览全部。
   * @param session 当前会话
   * @param series 系列实体
   */
  private async requireOwnership(
    session: UsecaseSession,
    series: CourseSeriesEntity,
  ): Promise<void> {
    if (this.isAdmin(session) || this.isManager(session)) return;
    if (this.isCoach(session)) {
      const coach = await this.coachService.findByAccountId(session.accountId);
      if (!coach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
      }
      const ok = series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
      if (!ok) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该课程系列的排期预览');
      }
      return;
    }
    throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '缺少查看课程排期预览的权限');
  }

  /**
   * 日期解析与基本校验（本地时区，不经 UTC）
   * @param start 输入开始日期字符串
   * @param end 输入结束日期字符串
   */
  private parseAndValidateDates(start: string, end: string): { start: Date; end: Date } {
    const s = this.normalizeDate(start);
    const e = this.normalizeDate(end);
    if (!s || !e || s > e) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '系列日期非法');
    }
    const maxSpanDays = 365;
    if (this.daysBetween(s, e) > maxSpanDays) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '系列跨度过长');
    }
    return { start: s, end: e };
  }

  /**
   * 归一化日期（YYYY-MM-DD → 本地时区的零点）
   * @param d 输入日期字符串或 Date
   */
  private normalizeDate(d: string | Date): Date | null {
    if (d instanceof Date) {
      return isNaN(d.getTime()) ? null : d;
    }
    const [y, m, dd] = String(d)
      .split('-')
      .map((t) => Number(t));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return null;
    const obj = new Date(y, m - 1, dd, 0, 0, 0, 0);
    return isNaN(obj.getTime()) ? null : obj;
  }

  /**
   * 计算两个日期的天数跨度（绝对值）
   */
  private daysBetween(a: Date, b: Date): number {
    const ms = Math.abs(b.getTime() - a.getTime());
    return Math.floor(ms / (24 * 3600 * 1000));
  }

  /**
   * 周期规则浅校验：允许空；非空需包含 BYDAY 或 BYHOUR/ BYMINUTE 中至少一个关键字。
   * 标准格式示例：BYDAY=MO,WE,FR;BYHOUR=9;BYMINUTE=0
   */
  private validateRecurrenceRuleMaybe(rule?: string | null): void {
    if (!rule) return;
    const r = rule.trim().toUpperCase();
    // 约束前端：必须同时提供 BYDAY 与 BYHOUR；BYMINUTE 可选
    if (!r.includes('BYDAY=') || !r.includes('BYHOUR=')) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '周期规则语法非法');
    }
  }

  /**
   * 生成 occurrence 列表（仅内存）
   * @param series 目标系列
   * @param start 起始日期（本地时区零点）
   * @param end 结束日期（本地时区零点）
   * @param opts 生成选项（课时长度/冲突检查）
   */
  private generateOccurrences(
    series: CourseSeriesEntity,
    start: Date,
    end: Date,
    opts: { durationMinutes: number; enableConflictCheck: boolean },
  ): ReadonlyArray<PreviewOccurrence> {
    const rule = (series.recurrenceRule ?? '').trim();
    if (rule.length === 0) return [];

    const cfg = this.parseRecurrenceRule(rule);
    const days: number[] = cfg.byDays.length > 0 ? cfg.byDays : [this.getWeekdayIndex(start)];
    const items: PreviewOccurrence[] = [];

    for (
      let dt = new Date(start.getTime());
      dt.getTime() <= end.getTime();
      dt.setDate(dt.getDate() + 1)
    ) {
      const w = this.getWeekdayIndex(dt);
      if (!days.includes(w)) continue;
      const sdt = new Date(
        dt.getFullYear(),
        dt.getMonth(),
        dt.getDate(),
        cfg.hour,
        cfg.minute,
        0,
        0,
      );
      const edt = new Date(sdt.getTime() + opts.durationMinutes * 60 * 1000);
      const dateStr = this.toDateString(dt);
      const occ: PreviewOccurrence = {
        startDateTime: sdt,
        endDateTime: edt,
        date: dateStr,
        weekdayIndex: w,
        conflict: null,
      };
      items.push(occ);
    }
    return items;
  }

  /**
   * 解析周期规则（标准格式：BYDAY=MON,WED,FRI;BYHOUR=9;BYMINUTE=0）
   */
  private parseRecurrenceRule(rule: string): { byDays: number[]; hour: number; minute: number } {
    const normalized = rule.trim().toUpperCase().replace(/;/g, '&');
    const pairs = normalized
      .split('&')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const kv: Record<string, string> = {};
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      kv[key] = value;
    }

    const dayCodes = (kv['BYDAY'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const byDays: number[] = dayCodes
      .map((code) => this.mapDayCodeToIndex(code))
      .filter((idx) => idx > 0);

    const hourRaw = kv['BYHOUR'];
    if (!hourRaw) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '周期规则缺少 BYHOUR');
    }
    const hour = Number.parseInt(hourRaw, 10);
    const minuteRaw = kv['BYMINUTE'];
    const minute = minuteRaw ? Number.parseInt(minuteRaw, 10) : 0;

    return { byDays, hour, minute };
  }

  /**
   * 星期索引（1=周一 … 7=周日）
   */
  private getWeekdayIndex(d: Date): number {
    const js = d.getDay(); // 0=周日 … 6=周六
    return js === 0 ? 7 : js;
  }

  /**
   * 映射 BYDAY 代码到星期索引
   */
  private mapDayCodeToIndex(code: string): number {
    const c = code.toUpperCase();
    switch (c) {
      case 'MO':
      case 'MON':
        return 1;
      case 'TU':
      case 'TUE':
        return 2;
      case 'WE':
      case 'WED':
        return 3;
      case 'TH':
      case 'THU':
        return 4;
      case 'FR':
      case 'FRI':
        return 5;
      case 'SA':
      case 'SAT':
        return 6;
      case 'SU':
      case 'SUN':
        return 7;
      default:
        return 0;
    }
  }

  /**
   * YYYY-MM-DD（本地时区）
   */
  private toDateString(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 对预览项应用时间冲突检测（同主教练维度）
   * @param series 目标系列（用于读取发布者/教练维度）
   * @param items 预览 occurrence 列表（原地标记 conflict）
   */
  private async applyConflictDetection(
    series: CourseSeriesEntity,
    items: PreviewOccurrence[],
  ): Promise<void> {
    // 仅当发布者类型为 COACH 时按主教练维度做冲突检测
    if (series.publisherType !== PublisherType.COACH) {
      for (const it of items) {
        it.conflict = { hasConflict: false, count: 0 };
      }
      return;
    }

    const coachId = series.publisherId;
    const rangeStart = items.length > 0 ? items[0].startDateTime : null;
    const rangeEnd = items.length > 0 ? items[items.length - 1].endDateTime : null;
    if (!rangeStart || !rangeEnd) {
      for (const it of items) {
        it.conflict = { hasConflict: false, count: 0 };
      }
      return;
    }

    const existed = await this.sessionsService.findScheduledByCoachAndRange({
      coachId,
      rangeStart,
      rangeEnd,
    });

    // 简单区间重叠判定：start < existed.end && end > existed.start
    for (const it of items) {
      let count = 0;
      for (const s of existed) {
        if (it.startDateTime < s.endTime && it.endDateTime > s.startTime) count++;
      }
      it.conflict = { hasConflict: count > 0, count };
    }
  }
}
