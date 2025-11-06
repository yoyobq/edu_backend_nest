// src/usecases/course-catalogs/search-catalogs.usecase.ts
import type { PaginatedResult, PaginationParams } from '@core/pagination/pagination.types';
import { CourseCatalogEntity } from '@modules/course-catalogs/course-catalog.entity';
import { CourseCatalogService } from '@modules/course-catalogs/course-catalog.service';
import { Injectable } from '@nestjs/common';

/**
 * 课程目录分页搜索用例
 * - 纯读操作，负责编排调用模块服务并返回统一分页结果
 * - 支持文本检索与排序白名单，在服务层统一处理
 */
@Injectable()
export class SearchCatalogsUsecase {
  constructor(private readonly courseCatalogService: CourseCatalogService) {}

  /**
   * 执行分页搜索
   * @param args 查询参数对象，包含统一分页参数与可选检索关键词
   * @returns 分页后的课程目录结果
   */
  async execute(args: {
    readonly params: PaginationParams;
    readonly query?: string;
  }): Promise<PaginatedResult<CourseCatalogEntity>> {
    return await this.courseCatalogService.searchCatalogs({
      params: args.params,
      query: args.query,
    });
  }
}
