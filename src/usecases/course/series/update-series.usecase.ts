// src/usecases/course/payout/update-series.usecase.ts
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSeriesStatus, PublisherType } from '@app-types/models/course-series.types';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
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
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

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
      const series = await this.seriesService.findById(args.id);
      if (!series) {
        throw new DomainError(COURSE_SERIES_ERROR.SERIES_NOT_FOUND, '开课班不存在');
      }

      const roles = (args.session.roles ?? []).map((r) => String(r).toUpperCase());
      const isAdmin = roles.includes('ADMIN');
      const isManager = roles.includes('MANAGER');
      const isCoach = roles.includes('COACH');

      if (!isAdmin && !isManager && !isCoach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权更新开课班');
      }

      if (!isAdmin && !isManager && isCoach) {
        if (series.status !== CourseSeriesStatus.PLANNED) {
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅允许更新未发布的开课班');
        }
        const coach = await this.coachService.findByAccountId(args.session.accountId);
        if (!coach) {
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
        }
        const owned =
          series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
        if (!owned) {
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权更新该开课班');
        }
      }

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
