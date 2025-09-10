// src/modules/course-catalogs/course-catalog.service.ts

import { CourseLevel } from '@app-types/models/course.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
      order: { createdAt: 'ASC' },
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
   * 更新课程目录
   * @param id 课程目录 ID
   * @param updateData 更新数据
   * @returns 更新后的课程目录实体或 null
   */
  async update(
    id: number,
    updateData: Partial<CourseCatalogEntity>,
  ): Promise<CourseCatalogEntity | null> {
    await this.courseCatalogRepository.update(id, updateData);
    return await this.findById(id);
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
}
