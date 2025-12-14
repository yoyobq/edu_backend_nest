// src/usecases/course/payout/search-series.usecase.ts
import type { PaginatedResult, PaginationParams } from '@core/pagination/pagination.types';
import { Injectable } from '@nestjs/common';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';

/**
 * 开课班分页搜索用例（纯读）
 *
 * 说明：分页策略统一由 PaginationService 处理，允许传入排序白名单。
 */
@Injectable()
export class SearchSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行分页搜索
   * @param args 查询参数对象（分页参数 + 可选关键词）
   */
  async execute(args: {
    readonly params: PaginationParams;
    readonly query?: string;
  }): Promise<PaginatedResult<CourseSeriesEntity>> {
    return await this.seriesService.searchSeries({ params: args.params, query: args.query });
  }
}
