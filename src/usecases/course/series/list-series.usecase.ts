// src/usecases/course/payout/list-series.usecase.ts
import { Injectable } from '@nestjs/common';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';

/**
 * 列出课程系列用例（纯读）
 *
 * 返回所有有效课程系列，按创建时间排序。
 */
@Injectable()
export class ListSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行列表查询
   * @returns 有效课程系列列表
   */
  async execute(): Promise<CourseSeriesEntity[]> {
    return await this.seriesService.findAllActive();
  }
}
