// src/usecases/course/catalogs/get-catalog-by-level.usecase.ts
import { Injectable } from '@nestjs/common';
import { CourseLevel } from '@app-types/models/course.types';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';

/**
 * 按课程等级查询课程目录用例
 * 职责：编排调用模块层服务，按 `courseLevel` 返回单个课程目录
 * 依赖：仅依赖模块层的 `CourseCatalogService`，不直接依赖基础设施实现
 */
@Injectable()
export class GetCatalogByLevelUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行查询
   * @param args 入参对象，包含课程等级（枚举 CourseLevel）
   * @returns 匹配的课程目录实体或 null
   */
  async execute(args: { readonly courseLevel: CourseLevel }): Promise<CourseCatalogEntity | null> {
    return await this.courseCatalogService.findByCourseLevel(args.courseLevel);
  }
}
