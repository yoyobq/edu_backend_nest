// src/usecases/course/payout/get-series.usecase.ts
import { COURSE_SERIES_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';

/**
 * 获取课程系列用例
 *
 * 负责根据 ID 返回课程系列详情。
 */
@Injectable()
export class GetSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行获取课程系列
   * @param args 查询参数对象
   * @returns 课程系列实体
   */
  async execute(args: { readonly id: number }): Promise<CourseSeriesEntity> {
    const found = await this.seriesService.findById(args.id);
    if (!found) {
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '课程系列不存在');
    }
    return found;
  }
}
