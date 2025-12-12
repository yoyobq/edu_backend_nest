// src/modules/course-catalogs/course-catalog.service.ts

import { CourseLevel } from '@app-types/models/course.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, type QueryFailedError } from 'typeorm';
import { PaginationService } from '@modules/common/pagination.service';
import { CourseCatalogEntity } from './course-catalog.entity';

/**
 * 课程目录服务类
 * 提供课程目录相关的基础数据操作功能
 */
@Injectable()
export class CourseCatalogService {
  constructor(
    @InjectRepository(CourseCatalogEntity)
    private readonly courseCatalogRepository: Repository<CourseCatalogEntity>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * 根据 ID 查找课程目录
   * @param id 课程目录 ID
   * @returns 课程目录信息或 null
   */
  async findById(id: number): Promise<CourseCatalogEntity | null> {
    return await this.courseCatalogRepository.findOne({
      where: { id },
    });
  }

  /**
   * 根据课程等级查找课程目录
   * @param courseLevel 课程等级
   * @returns 课程目录信息或 null
   */
  async findByCourseLevel(courseLevel: CourseLevel): Promise<CourseCatalogEntity | null> {
    return await this.courseCatalogRepository.findOne({
      where: { courseLevel },
    });
  }

  /**
   * 获取所有有效的课程目录
   * @returns 有效课程目录列表
   */
  async findAllActive(): Promise<CourseCatalogEntity[]> {
    return await this.courseCatalogRepository.find({
      where: { deactivatedAt: IsNull() },
      order: { courseLevel: 'ASC' },
    });
  }

  /**
   * 获取所有课程目录（包括已下线）
   * @returns 所有课程目录列表
   */
  async findAll(): Promise<CourseCatalogEntity[]> {
    return await this.courseCatalogRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 创建课程目录
   * @param courseCatalogData 课程目录数据
   * @returns 创建的课程目录实体
   */
  async create(courseCatalogData: Partial<CourseCatalogEntity>): Promise<CourseCatalogEntity> {
    const courseCatalog = this.courseCatalogRepository.create(courseCatalogData);
    return await this.courseCatalogRepository.save(courseCatalog);
  }

  /**
   * 并发安全创建课程目录（按唯一约束幂等）
   * - 依赖数据库唯一约束：uk_catalogs_course_level（字段：courseLevel）
   * - 在并发场景下，当出现重复键冲突时不抛错，回退为查询并返回已存在的记录
   * - 保证 `@CreateDateColumn` / `@UpdateDateColumn` 通过 `save` 自动维护（成功创建时）
   *
   * @param courseCatalogData 课程目录数据（需包含 courseLevel）
   * @returns { catalog: CourseCatalogEntity; isNewlyCreated: boolean }
   */
  async createOrGet(
    courseCatalogData: Partial<CourseCatalogEntity>,
  ): Promise<{ catalog: CourseCatalogEntity; isNewlyCreated: boolean }> {
    try {
      const created = await this.create(courseCatalogData);
      return { catalog: created, isNewlyCreated: true };
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        // 并发插入导致的重复键：按唯一键回退查询并返回幂等结果
        const level = courseCatalogData.courseLevel as CourseLevel;
        const existing = await this.findByCourseLevel(level);
        if (!existing) {
          // 理论上不会发生：插入报重复但又查不到记录
          throw err;
        }
        return { catalog: existing, isNewlyCreated: false };
      }
      throw err;
    }
  }

  /**
   * 检测是否为唯一约束冲突错误（MySQL / PostgreSQL 兼容）
   * - MySQL：code=ER_DUP_ENTRY / errno=1062 / sqlState=23000
   * - PostgreSQL：code=23505
   * @param error 捕获的错误对象
   */
  private isUniqueConstraintViolation(error: unknown): boolean {
    const e = error as QueryFailedError & { driverError?: Record<string, unknown> };
    const d = e?.driverError ?? (error as Record<string, unknown>);
    const code = d?.code as string | undefined;
    const errno = d?.errno as number | undefined;
    const sqlState = d?.sqlState as string | undefined;
    return code === 'ER_DUP_ENTRY' || errno === 1062 || sqlState === '23000' || code === '23505';
  }

  /**
   * 更新课程目录
   * @param id 课程目录 ID
   * @param updateData 更新数据
   * @returns 更新后的课程目录实体或 null
   */
  async update(
    id: number,
    updateData: Partial<CourseCatalogEntity>,
  ): Promise<CourseCatalogEntity | null> {
    // 使用先查询再 merge + save 的方式，确保实体完整性与 @UpdateDateColumn 自动维护
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }
    const merged = this.courseCatalogRepository.merge(existing, updateData);
    const saved = await this.courseCatalogRepository.save(merged);
    return saved ?? null;
  }

  /**
   * 下线课程目录
   * @param id 课程目录 ID
   * @param updatedBy 操作者 ID
   * @returns 更新后的课程目录实体或 null
   */
  async deactivate(id: number, updatedBy?: number): Promise<CourseCatalogEntity | null> {
    const updateData: Partial<CourseCatalogEntity> = {
      deactivatedAt: new Date(),
    };
    if (updatedBy) {
      updateData.updatedBy = updatedBy;
    }
    return await this.update(id, updateData);
  }

  /**
   * 重新激活课程目录
   * @param id 课程目录 ID
   * @param updatedBy 操作者 ID
   * @returns 更新后的课程目录实体或 null
   */
  async reactivate(id: number, updatedBy?: number): Promise<CourseCatalogEntity | null> {
    const updateData: Partial<CourseCatalogEntity> = {
      deactivatedAt: null,
    };
    if (updatedBy) {
      updateData.updatedBy = updatedBy;
    }
    return await this.update(id, updateData);
  }

  /**
   * 搜索 / 分页查询课程目录
   * - 文本搜索支持 `title` 与 `description`
   * - 统一支持 OFFSET / CURSOR 分页与排序白名单
   * - 仅返回未下线的数据（`deactivatedAt IS NULL`）
   * @param args 查询参数（包含分页与可选文本查询）
   */
  async searchCatalogs(args: {
    readonly params: import('@core/pagination/pagination.types').PaginationParams;
    readonly query?: string;
  }): Promise<import('@core/pagination/pagination.types').PaginatedResult<CourseCatalogEntity>> {
    const { params, query } = args;

    const qb = this.courseCatalogRepository.createQueryBuilder('catalog');
    qb.where('catalog.deactivatedAt IS NULL');

    const q = (query ?? '').trim();
    if (q.length > 0) {
      qb.andWhere('(catalog.title LIKE :q OR catalog.description LIKE :q)', {
        q: `%${q}%`,
      });
    }

    const allowedSorts: ReadonlyArray<string> = [
      'id',
      'courseLevel',
      'title',
      'createdAt',
      'updatedAt',
    ];
    const defaultSorts: ReadonlyArray<import('@core/pagination/pagination.types').SortParam> = [
      { field: 'id', direction: 'DESC' },
      { field: 'createdAt', direction: 'DESC' },
    ];

    return this.paginationService.paginateQuery<CourseCatalogEntity>({
      qb,
      params,
      allowedSorts,
      defaultSorts,
      // 使用数值主键 id 作为游标主键，避免时间类型比较差异
      cursorKey: { primary: 'id', tieBreaker: 'createdAt' },
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'id':
            return 'catalog.id';
          case 'courseLevel':
            return 'catalog.courseLevel';
          case 'title':
            return 'catalog.title';
          case 'createdAt':
            return 'catalog.createdAt';
          case 'updatedAt':
            return 'catalog.updatedAt';
          default:
            return null;
        }
      },
      // 为 CURSOR 模式提供访问器，将 Date 转为 ISO 字符串，避免不支持的主键类型
      accessors: {
        // 主键：返回数值 id
        primary: (row: unknown): number | null | undefined => {
          const r = row as CourseCatalogEntity;
          return typeof r.id === 'number' ? r.id : null;
        },
        // 副键：createdAt，仅用于同 id 的稳定排序（几乎不会触发）
        tieBreaker: (row: unknown): string | number | null | undefined => {
          const r = row as CourseCatalogEntity;
          const v = r.createdAt as unknown;
          if (v == null) return null;
          if (v instanceof Date) return v.toISOString();
          return typeof v === 'string' || typeof v === 'number' ? v : null;
        },
      },
    });
  }
}
