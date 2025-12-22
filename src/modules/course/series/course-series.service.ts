// src/modules/course-series/course-series.service.ts
import {
  ClassMode,
  CourseSeriesStatus,
  PublisherType,
} from '@app-types/models/course-series.types';
import { trimText } from '@core/common/text/text.helper';
import type {
  PaginatedResult,
  PaginationParams,
  SortParam,
} from '@core/pagination/pagination.types';
import { PaginationService } from '@modules/common/pagination.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import { CourseSeriesEntity } from './course-series.entity';

export type CourseSeriesAccessInfo = {
  readonly id: number;
  readonly status: CourseSeriesStatus;
  readonly startDate: string;
  readonly endDate: string;
};

export type SearchCourseSeriesFilters = {
  readonly activeOnly?: boolean;
  readonly statuses?: ReadonlyArray<CourseSeriesStatus>;
  readonly classMode?: ClassMode;
  readonly startDateFrom?: string;
  readonly startDateTo?: string;
  readonly endDateFrom?: string;
  readonly endDateTo?: string;
};

export type SearchCourseSeriesPublisherFilter = {
  readonly publisherType: PublisherType;
  readonly publisherId: number;
};

/**
 * 开课班服务
 * 提供开课班的基础读/写方法，供 usecases 复用
 */
@Injectable()
export class CourseSeriesService {
  constructor(
    @InjectRepository(CourseSeriesEntity)
    private readonly seriesRepo: Repository<CourseSeriesEntity>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * 根据 ID 获取开课班
   * @param id 开课班 ID
   */
  async findById(id: number): Promise<CourseSeriesEntity | null> {
    return await this.seriesRepo.findOne({ where: { id } });
  }

  /**
   * 获取开课班访问裁剪所需字段（读模型）
   * @param params 查询参数对象：seriesId
   * @returns 访问裁剪信息（不存在则返回 null）
   */
  async findAccessInfoById(params: {
    readonly seriesId: number;
  }): Promise<CourseSeriesAccessInfo | null> {
    const series = await this.seriesRepo.findOne({
      where: { id: params.seriesId },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (!series) return null;
    return {
      id: series.id,
      status: series.status,
      startDate: series.startDate,
      endDate: series.endDate,
    };
  }

  /**
   * 列出全部开课班（含所有状态）
   * @returns 开课班列表，按创建时间升序
   */
  async findAll(): Promise<CourseSeriesEntity[]> {
    return await this.seriesRepo.find({ order: { createdAt: 'ASC' } });
  }

  /**
   * 列出有效的开课班（排除 CLOSED/FINISHED）
   * @returns 有效开课班列表
   */
  async findAllActive(): Promise<CourseSeriesEntity[]> {
    return await this.seriesRepo.find({
      where: {
        status: In([CourseSeriesStatus.PLANNED, CourseSeriesStatus.PUBLISHED]),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 分页搜索开课班（纯读，供 usecase 复用）
   * @param args 查询参数对象（分页参数 + 可选关键词）
   * @returns 分页后的开课班结果
   */
  async searchSeries(args: {
    readonly params: PaginationParams;
    readonly query?: string;
    readonly filters?: SearchCourseSeriesFilters;
    readonly publisher?: SearchCourseSeriesPublisherFilter;
  }): Promise<PaginatedResult<CourseSeriesEntity>> {
    const qb = this.buildSearchSeriesQuery();
    this.applyStatusesFilter({ qb, filters: args.filters });
    this.applyPublisherFilter({ qb, publisher: args.publisher });
    this.applyClassModeFilter({ qb, classMode: args.filters?.classMode });
    this.applyDateRangeFilter({
      qb,
      startDateFrom: args.filters?.startDateFrom,
      startDateTo: args.filters?.startDateTo,
      endDateFrom: args.filters?.endDateFrom,
      endDateTo: args.filters?.endDateTo,
    });
    this.applyTitleQuery({ qb, query: args.query });

    const { allowedSorts, defaultSorts, resolveColumn } = this.getSeriesPaginationSpec();
    return await this.paginationService.paginateQuery<CourseSeriesEntity>({
      qb,
      params: args.params,
      allowedSorts,
      defaultSorts,
      cursorKey: { primary: 'createdAt', tieBreaker: 'id' },
      resolveColumn,
      accessors: {
        primary: (row) => {
          const value = (row as Record<string, unknown>)['createdAt'];
          if (value instanceof Date) {
            const yyyy = value.getFullYear();
            const mm = String(value.getMonth() + 1).padStart(2, '0');
            const dd = String(value.getDate()).padStart(2, '0');
            const hh = String(value.getHours()).padStart(2, '0');
            const min = String(value.getMinutes()).padStart(2, '0');
            const ss = String(value.getSeconds()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
          }
          if (typeof value === 'string') {
            const asPlain = value.includes('T') ? value.replace('T', ' ').replace(/Z$/, '') : value;
            return asPlain.length >= 19 ? asPlain.slice(0, 19) : asPlain;
          }
          if (typeof value === 'number') return value;
          return null;
        },
        tieBreaker: (row) => {
          const value = (row as Record<string, unknown>)['id'];
          if (typeof value === 'number' || typeof value === 'string') return value;
          return null;
        },
      },
    });
  }

  private buildSearchSeriesQuery(): SelectQueryBuilder<CourseSeriesEntity> {
    return this.seriesRepo.createQueryBuilder('series').select('series');
  }

  private applyStatusesFilter(params: {
    readonly qb: SelectQueryBuilder<CourseSeriesEntity>;
    readonly filters?: SearchCourseSeriesFilters;
  }): void {
    const { qb, filters } = params;
    const statuses = this.resolveStatusesForSearch(filters);
    if (!statuses) return;
    qb.andWhere('series.status IN (:...statuses)', { statuses });
  }

  /**
   * 解析搜索时的状态过滤规则。
   *
   * 规则说明：
   * - `filters` 未传入时，默认不做状态过滤（即返回全量状态）；
   * - 若显式传入 `statuses`，则以 `statuses` 为准；
   * - 否则仅当 `activeOnly === true` 时，才收敛到“有效”状态（`PLANNED` / `PUBLISHED`）。
   * @param filters 搜索过滤条件
   * @returns 需要应用的状态列表；不需要过滤时返回 undefined
   */
  private resolveStatusesForSearch(
    filters?: SearchCourseSeriesFilters,
  ): ReadonlyArray<CourseSeriesStatus> | undefined {
    if (!filters) return undefined;
    if (filters.statuses && filters.statuses.length > 0) return filters.statuses;
    if (filters.activeOnly === true) {
      return [CourseSeriesStatus.PLANNED, CourseSeriesStatus.PUBLISHED];
    }
    return undefined;
  }

  private applyPublisherFilter(params: {
    readonly qb: SelectQueryBuilder<CourseSeriesEntity>;
    readonly publisher?: SearchCourseSeriesPublisherFilter;
  }): void {
    const { qb, publisher } = params;
    if (!publisher) return;
    qb.andWhere('series.publisherType = :publisherType', {
      publisherType: publisher.publisherType,
    });
    qb.andWhere('series.publisherId = :publisherId', { publisherId: publisher.publisherId });
  }

  private applyClassModeFilter(params: {
    readonly qb: SelectQueryBuilder<CourseSeriesEntity>;
    readonly classMode?: ClassMode;
  }): void {
    const { qb, classMode } = params;
    if (!classMode) return;
    qb.andWhere('series.classMode = :classMode', { classMode });
  }

  /**
   * 规范化日期字符串入参。
   * @param value 日期字符串（YYYY-MM-DD）
   * @returns 规范化后的日期字符串（YYYY-MM-DD）；无效值返回 undefined
   */
  private normalizeDateString(value?: string): string | undefined {
    const trimmed = trimText(value);
    if (!trimmed) return undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
    return trimmed;
  }

  private applyDateRangeFilter(params: {
    readonly qb: SelectQueryBuilder<CourseSeriesEntity>;
    readonly startDateFrom?: string;
    readonly startDateTo?: string;
    readonly endDateFrom?: string;
    readonly endDateTo?: string;
  }): void {
    /**
     * 日期过滤语义：区间相交（overlap），而不是“完全落在区间内”。
     *
     * - queryStart：由 `startDateFrom` / `endDateFrom` 折叠得到（若同时传入则要求两者一致）
     * - queryEnd：由 `startDateTo` / `endDateTo` 折叠得到（若同时传入则要求两者一致）
     *
     * overlap 判定：
     * - 当 queryStart 存在：`series.endDate >= queryStart`
     * - 当 queryEnd 存在：`series.startDate <= queryEnd`
     */
    const { qb } = params;
    const startDateFrom = this.normalizeDateString(params.startDateFrom);
    const endDateFrom = this.normalizeDateString(params.endDateFrom);
    const startDateTo = this.normalizeDateString(params.startDateTo);
    const endDateTo = this.normalizeDateString(params.endDateTo);

    const queryStart = startDateFrom ?? endDateFrom;
    const queryEnd = startDateTo ?? endDateTo;

    if (queryStart) qb.andWhere('series.endDate >= :queryStart', { queryStart });
    if (queryEnd) qb.andWhere('series.startDate <= :queryEnd', { queryEnd });
  }

  private applyTitleQuery(params: {
    readonly qb: SelectQueryBuilder<CourseSeriesEntity>;
    readonly query?: string;
  }): void {
    const { qb } = params;
    const q = (params.query ?? '').trim();
    if (q.length === 0) return;
    qb.andWhere('series.title LIKE :kw', { kw: `%${q}%` });
  }

  private getSeriesPaginationSpec(): {
    readonly allowedSorts: ReadonlyArray<string>;
    readonly defaultSorts: ReadonlyArray<SortParam>;
    readonly resolveColumn: (field: string) => string | null;
  } {
    const allowedSorts: ReadonlyArray<string> = [
      'id',
      'createdAt',
      'updatedAt',
      'startDate',
      'endDate',
      'title',
      'status',
      'classMode',
    ];
    const defaultSorts: ReadonlyArray<SortParam> = [
      { field: 'createdAt', direction: 'DESC' },
      { field: 'id', direction: 'DESC' },
    ];

    const resolveColumn = (field: string): string | null => {
      const map: Record<string, string> = {
        id: 'series.id',
        createdAt: 'series.createdAt',
        updatedAt: 'series.updatedAt',
        startDate: 'series.startDate',
        endDate: 'series.endDate',
        title: 'series.title',
        status: 'series.status',
        classMode: 'series.classMode',
      };
      return map[field] ?? null;
    };

    return { allowedSorts, defaultSorts, resolveColumn };
  }

  /**
   * 创建开课班
   * @param data 创建数据
   */
  async create(data: Partial<CourseSeriesEntity>): Promise<CourseSeriesEntity> {
    const created = this.seriesRepo.create(data);
    return await this.seriesRepo.save(created);
  }

  /**
   * 更新开课班
   * @param id 开课班 ID
   * @param data 更新数据
   */
  async update(id: number, data: Partial<CourseSeriesEntity>): Promise<CourseSeriesEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const merged = this.seriesRepo.merge(existing, data);
    const saved = await this.seriesRepo.save(merged);
    return saved ?? null;
  }

  /**
   * 更新系列的起止范围与状态（支持事务）
   * @param manager 事务管理器
   * @param input 更新数据对象
   */
  async updateRangeAndStatus(
    manager: EntityManager,
    input: { id: number; startDate: string; endDate: string; status: CourseSeriesStatus },
  ): Promise<void> {
    const repo = manager.getRepository(CourseSeriesEntity);
    await repo.update(
      { id: input.id },
      { startDate: input.startDate, endDate: input.endDate, status: input.status },
    );
  }

  /**
   * 删除开课班（物理删除）
   * @param id 开课班 ID
   * @returns 是否删除成功
   */
  async deleteById(id: number): Promise<boolean> {
    const result = await this.seriesRepo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
