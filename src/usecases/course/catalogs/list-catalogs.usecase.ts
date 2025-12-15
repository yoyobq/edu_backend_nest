// src/usecases/course-catalogs/list-catalogs.usecase.ts
import { Injectable } from '@nestjs/common';
import { CourseCatalogEntity } from '@src/modules/course/catalogs/course-catalog.entity';
import { CourseCatalogService } from '@src/modules/course/catalogs/course-catalog.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 获取课程目录列表用例
 */
@Injectable()
export class ListCatalogsUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 返回课程目录列表：admin/manager 返回全部，其它返回有效项
   * @returns 课程目录列表
   */
  async execute(session?: UsecaseSession): Promise<CourseCatalogEntity[]> {
    const roles = session?.roles ?? [];
    const isAdminOrManager =
      roles?.some((r) => {
        const v = String(r).toUpperCase();
        return v === 'ADMIN' || v === 'MANAGER';
      }) ?? false;
    return isAdminOrManager
      ? await this.courseCatalogService.findAll()
      : await this.courseCatalogService.findAllActive();
  }
}
