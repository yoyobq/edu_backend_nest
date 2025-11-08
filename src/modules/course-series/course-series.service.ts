// src/modules/course-series/course-series.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  /**
   * 根据 ID 获取课程系列
   * @param id 课程系列 ID
   */
  async findById(id: number): Promise<CourseSeriesEntity | null> {
    return await this.seriesRepo.findOne({ where: { id } });
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
}
