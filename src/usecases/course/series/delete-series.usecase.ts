// src/usecases/course/payout/delete-series.usecase.ts
import { COURSE_SERIES_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';

/**
 * 删除开课班用例
 *
 * 负责执行开课班的删除操作。
 */
@Injectable()
export class DeleteSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行删除开课班
   * @param args 删除参数对象
   * @returns 删除是否成功
   */
  async execute(args: { readonly id: number }): Promise<boolean> {
    try {
      const ok = await this.seriesService.deleteById(args.id);
      if (!ok) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_DELETE_FAILED, '删除开课班失败或不存在');
      }
      return true;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_DELETE_FAILED, '删除开课班失败', {
        error,
      });
    }
  }
}
