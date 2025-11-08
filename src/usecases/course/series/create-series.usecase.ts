// src/usecases/course/payout/create-series.usecase.ts
import { COURSE_SERIES_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';

/**
 * 创建课程系列用例
 *
 * 负责对接模块内的课程系列服务，执行创建操作。
 * - 严格对象参数传递
 * - 抛出领域错误以与适配层统一处理
 */
@Injectable()
export class CreateSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行创建课程系列
   * @param args 创建参数对象
   * @returns 创建成功的课程系列实体
   */
  async execute(args: { readonly data: Partial<CourseSeriesEntity> }): Promise<CourseSeriesEntity> {
    try {
      // 最基本的校验（示例）：标题不能为空
      const title = (args.data.title ?? '').trim();
      if (!title) {
        throw new DomainError(COURSE_SERIES_ERROR.TITLE_EMPTY, '课程系列标题不能为空');
      }
      return await this.seriesService.create({ ...args.data, title });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_CREATION_FAILED, '创建课程系列失败', {
        error,
      });
    }
  }
}
