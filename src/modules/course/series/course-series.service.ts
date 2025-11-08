// src/modules/course-series/course-series.service.ts
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import type {
  PaginatedResult,
  PaginationParams,
  SortParam,
} from '@core/pagination/pagination.types';
import { PaginationService } from '@modules/common/pagination.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { CourseSeriesEntity } from './course-series.entity';

/**
 * 课程系列服务
 * 提供课程系列的基础读/写方法，供 usecases 复用
 */
@Injectable()
export class CourseSeriesService {
  constructor(
    @InjectRepository(CourseSeriesEntity)
    private readonly seriesRepo: Repository<CourseSeriesEntity>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * 根据 ID 获取课程系列
   * @param id 课程系列 ID
   */
  async findById(id: number): Promise<CourseSeriesEntity | null> {
    return await this.seriesRepo.findOne({ where: { id } });
  }

  /**
   * 列出全部课程系列（含所有状态）
   * @returns 课程系列列表，按创建时间升序
   */
  async findAll(): Promise<CourseSeriesEntity[]> {
    return await this.seriesRepo.find({ order: { createdAt: 'ASC' } });
  }

  /**
   * 列出有效的课程系列（排除 CLOSED/FINISHED）
   * @returns 有效课程系列列表
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
   * 分页搜索课程系列（纯读，供 usecase 复用）
   * @param args 查询参数对象（分页参数 + 可选关键词）
   * @returns 分页后的课程系列结果
   */
  async searchSeries(args: {
    readonly params: PaginationParams;
    readonly query?: string;
  }): Promise<PaginatedResult<CourseSeriesEntity>> {
    const qb: SelectQueryBuilder<CourseSeriesEntity> = this.seriesRepo
      .createQueryBuilder('series')
      .select('series')
      .where('series.status IN (:...statuses)', {
        statuses: [CourseSeriesStatus.PLANNED, CourseSeriesStatus.PUBLISHED],
      });

    if (args.query && args.query.trim().length > 0) {
      qb.andWhere('series.title LIKE :kw', { kw: `%${args.query.trim()}%` });
    }

    const allowedSorts: ReadonlyArray<string> = [
      'id',
      'createdAt',
      'updatedAt',
      'startDate',
      'endDate',
      'title',
      'status',
    ];
    const defaultSorts: ReadonlyArray<SortParam> = [
      { field: 'createdAt', direction: 'DESC' },
      { field: 'id', direction: 'DESC' },
    ];

    const resolveColumn = (field: string): string | null => {
      const map: Record<string, string> = {
        id: 'series.id',
        createdAt: 'series.created_at',
        updatedAt: 'series.updated_at',
        startDate: 'series.start_date',
        endDate: 'series.end_date',
        title: 'series.title',
        status: 'series.status',
      };
      return map[field] ?? null;
    };

    return await this.paginationService.paginateQuery<CourseSeriesEntity>({
      qb,
      params: args.params,
      allowedSorts,
      defaultSorts,
      cursorKey: { primary: 'id', tieBreaker: 'createdAt' },
      resolveColumn,
    });
  }

  /**
   * 创建课程系列
   * @param data 创建数据
   */
  async create(data: Partial<CourseSeriesEntity>): Promise<CourseSeriesEntity> {
    const created = this.seriesRepo.create(data);
    return await this.seriesRepo.save(created);
  }

  /**
   * 更新课程系列
   * @param id 课程系列 ID
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
   * 删除课程系列（物理删除）
   * @param id 课程系列 ID
   * @returns 是否删除成功
   */
  async deleteById(id: number): Promise<boolean> {
    const result = await this.seriesRepo.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
