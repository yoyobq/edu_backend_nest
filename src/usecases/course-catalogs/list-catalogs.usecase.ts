// src/usecases/course-catalogs/list-catalogs.usecase.ts
import { Injectable } from '@nestjs/common';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';

/**
 * 获取课程目录列表用例
 */
@Injectable()
export class ListCatalogsUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 返回全部有效的课程目录，按创建时间排序
   * @returns 课程目录列表
   */
  async execute(): Promise<CourseCatalogEntity[]> {
    return await this.courseCatalogService.findAllActive();
  }
}
