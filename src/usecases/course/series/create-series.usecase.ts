// 文件位置：src/usecases/course/series/create-series.usecase.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
  VenueType,
} from '@app-types/models/course-series.types';
import {
  CATALOG_ERROR,
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface CreateSeriesInput {
  readonly catalogId: number;
  readonly title?: string;
  readonly description?: string | null;
  readonly venueType?: VenueType | string;
  readonly classMode?: ClassMode | string;
  readonly startDate: string | Date;
  readonly endDate: string | Date;
  readonly recurrenceRule?: string | null;
  readonly leaveCutoffHours?: number;
  readonly pricePerSession?: number | string | null;
  readonly teachingFeeRef?: number | string | null;
  readonly maxLearners?: number;
  readonly remark?: string | null;
}

export interface CreateSeriesOutput {
  readonly series: CourseSeriesEntity;
}

@Injectable()
export class CreateSeriesUsecase {
  constructor(
    private readonly catalogsService: CourseCatalogService,
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行创建开课班草稿
   * 仅创建 `course_series`，状态为 `PLANNED`，不生成节次、不写 Outbox。
   */
  async execute(params: {
    readonly session: UsecaseSession;
    readonly input: CreateSeriesInput;
  }): Promise<CreateSeriesOutput> {
    const { session, input } = params;
    this.requireAuthorized(session);
    await this.verifyCatalogExists(input.catalogId);

    const { start, end } = this.parseAndValidateDates(input.startDate, input.endDate);

    const classModeEnum = this.parseClassMode(input.classMode);
    const maxLearners = input.maxLearners ?? 1;
    this.validateCapacity(classModeEnum, maxLearners);

    this.validateRecurrenceRuleMaybe(input.recurrenceRule);

    const { publisherType, publisherId } = await this.resolvePublisher(session);
    const title = this.sanitizeTitleOrThrow(input.title);

    const series = await this.seriesService.create({
      catalogId: input.catalogId,
      publisherType,
      publisherId,
      title,
      description: input.description ?? null,
      venueType: this.parseVenueType(input.venueType),
      classMode: classModeEnum,
      startDate: this.toDateString(start),
      endDate: this.toDateString(end),
      recurrenceRule: input.recurrenceRule ?? null,
      leaveCutoffHours: input.leaveCutoffHours ?? 12,
      pricePerSession: this.toDecimalString(input.pricePerSession),
      teachingFeeRef: this.toDecimalString(input.teachingFeeRef),
      maxLearners,
      status: CourseSeriesStatus.DRAFT,
      remark: input.remark ?? null,
      createdBy: session.accountId,
      updatedBy: session.accountId,
    });

    return { series };
  }

  private isAdmin(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'ADMIN') ?? false;
  }
  private isManager(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'MANAGER') ?? false;
  }
  private isCoach(session: UsecaseSession): boolean {
    return session.roles?.some((r) => String(r).toUpperCase() === 'COACH') ?? false;
  }

  private async resolvePublisher(
    session: UsecaseSession,
  ): Promise<{ publisherType: PublisherType; publisherId: number }> {
    if (this.isManager(session)) {
      const manager = await this.managerService.findByAccountId(session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Manager 身份');
      }
      return { publisherType: PublisherType.MANAGER, publisherId: manager.id };
    }
    if (this.isCoach(session)) {
      const coach = await this.coachService.findByAccountId(session.accountId);
      if (!coach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
      }
      return { publisherType: PublisherType.COACH, publisherId: coach.id };
    }
    if (this.isAdmin(session)) {
      const manager = await this.managerService.findByAccountId(session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '管理员未绑定 Manager 身份');
      }
      return { publisherType: PublisherType.MANAGER, publisherId: manager.id };
    }
    throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '不支持的发布者身份');
  }

  private normalizeDate(d: string | Date): Date | null {
    if (d instanceof Date) {
      return isNaN(d.getTime()) ? null : d;
    }
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  /**
   * 将 Date 转为 YYYY-MM-DD 字符串（本地时区，不经 UTC）
   * @param d 输入的 Date 对象
   * @returns 格式化后的日期字符串（YYYY-MM-DD）
   */
  private toDateString(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private daysBetween(a: Date, b: Date): number {
    const ms = Math.abs(b.getTime() - a.getTime());
    return Math.floor(ms / (24 * 3600 * 1000));
  }
  private parseClassMode(v?: ClassMode | string): ClassMode {
    const k = String(v ?? ClassMode.SMALL_CLASS).toUpperCase();
    return k === 'LARGE_CLASS' ? ClassMode.LARGE_CLASS : ClassMode.SMALL_CLASS;
  }
  private parseVenueType(v?: VenueType | string): VenueType {
    const k = String(v ?? VenueType.SANDA_GYM).toUpperCase();
    return (VenueType as Record<string, VenueType>)[k] ?? VenueType.SANDA_GYM;
  }
  /**
   * 将金额/小数转换为两位定点字符串；非法输入抛业务错误
   * @param v 支持 number / string / null（null 按空处理）
   * @returns 两位小数字符串；null 表示未传值
   */
  private toDecimalString(v?: number | string | null): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '价格参数非法');
      }
      return v.toFixed(2);
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '价格参数非法');
    }
    return n.toFixed(2);
  }
  private isRecurrenceRuleValid(rule: string): boolean {
    const r = rule.trim().toUpperCase();
    if (r.length === 0) return false;
    const tokens = ['BYDAY=', 'BYHOUR=', 'BYMINUTE='];
    return tokens.some((t) => r.includes(t));
  }

  private requireAuthorized(session: UsecaseSession): void {
    const ok = this.isAdmin(session) || this.isManager(session) || this.isCoach(session);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '缺少创建开课班权限');
    }
  }
  private async verifyCatalogExists(catalogId: number): Promise<void> {
    const catalog = await this.catalogsService.findById(catalogId);
    if (!catalog) {
      throw new DomainError(CATALOG_ERROR.NOT_FOUND, '课程目录不存在');
    }
  }
  private parseAndValidateDates(
    startDate: string | Date,
    endDate: string | Date,
  ): {
    start: Date;
    end: Date;
  } {
    const start = this.normalizeDate(startDate);
    const end = this.normalizeDate(endDate);
    if (!start || !end || start > end) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '系列日期非法');
    }
    const maxSpanDays = 365 * 2;
    if (this.daysBetween(start, end) > maxSpanDays) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '系列跨度过长');
    }
    return { start, end };
  }
  private validateCapacity(classMode: ClassMode, maxLearners: number): void {
    if (classMode === ClassMode.SMALL_CLASS) {
      if (maxLearners < 1 || maxLearners > 4) {
        throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '小班课容量需在 1–4');
      }
      return;
    }
    if (classMode === ClassMode.LARGE_CLASS) {
      if (maxLearners < 0) {
        throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '大班课容量必须为非负');
      }
    }
  }
  private validateRecurrenceRuleMaybe(rule?: string | null): void {
    if (rule && !this.isRecurrenceRuleValid(rule)) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DATE_INVALID, '周期规则语法非法');
    }
  }
  private sanitizeTitleOrThrow(title?: string): string {
    const t = (title ?? '').trim();
    if (!t) {
      throw new DomainError(COURSE_SERIES_ERROR.TITLE_EMPTY, '课程系列标题不能为空');
    }
    return t;
  }
}
