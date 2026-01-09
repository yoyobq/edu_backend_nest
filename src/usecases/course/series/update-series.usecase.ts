// src/usecases/course/payout/update-series.usecase.ts
import { COURSE_SERIES_ERROR, DomainError } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { UsecaseSession } from '@src/types/auth/session.types';

/**
 * 更新开课班用例
 *
 * 负责执行开课班的更新操作：按 ID 更新允许的字段。
 */
@Injectable()
export class UpdateSeriesUsecase {
  constructor(private readonly seriesService: CourseSeriesService) {}

  /**
   * 执行更新开课班
   * @param args 更新参数对象
   * @returns 更新后的开课班实体
   */
  async execute(args: {
    readonly session: UsecaseSession;
    readonly id: number;
    readonly data: Partial<CourseSeriesEntity>;
  }): Promise<CourseSeriesEntity> {
    try {
      const patch = { ...args.data };
      if (args.session.accountId) {
        patch.updatedBy = args.session.accountId;
      }

      const updated = await this.seriesService.update(args.id, patch);
      if (!updated) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(COURSE_SERIES_ERROR.SERIES_UPDATE_FAILED, '更新开课班失败', {
        error,
      });
    }
  }
}
