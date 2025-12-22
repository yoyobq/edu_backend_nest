// src/usecases/course/series/search-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { PublisherType } from '@app-types/models/course-series.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { trimText } from '@core/common/text/text.helper';
import type { PaginatedResult, PaginationParams } from '@core/pagination/pagination.types';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import {
  CourseSeriesService,
  type SearchCourseSeriesFilters,
} from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 开课班分页搜索用例（纯读）
 *
 * 说明：分页策略统一由 PaginationService 处理，允许传入排序白名单。
 */
@Injectable()
export class SearchSeriesUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 执行分页搜索
   * @param args 查询参数对象（分页参数 + 可选关键词）
   */
  async execute(args: {
    readonly session: UsecaseSession;
    readonly params: {
      readonly pagination: PaginationParams;
      readonly query?: string;
      readonly filters?: SearchCourseSeriesFilters;
    };
  }): Promise<PaginatedResult<CourseSeriesEntity>> {
    this.ensurePermissions(args.session);
    this.validateFilters(args.params.filters);

    const isCoach = hasRole(args.session.roles, IdentityTypeEnum.COACH);
    const publisher =
      isCoach && !hasRole(args.session.roles, IdentityTypeEnum.MANAGER)
        ? await this.getCoachPublisherFilter(args.session)
        : undefined;

    return await this.seriesService.searchSeries({
      params: args.params.pagination,
      query: args.params.query,
      filters: args.params.filters,
      publisher,
    });
  }

  private validateFilters(filters?: SearchCourseSeriesFilters): void {
    if (!filters) return;

    const startDateFrom = this.normalizeDateFilterValue({
      value: filters.startDateFrom,
      field: 'startDateFrom',
    });
    const endDateFrom = this.normalizeDateFilterValue({
      value: filters.endDateFrom,
      field: 'endDateFrom',
    });
    const startDateTo = this.normalizeDateFilterValue({
      value: filters.startDateTo,
      field: 'startDateTo',
    });
    const endDateTo = this.normalizeDateFilterValue({
      value: filters.endDateTo,
      field: 'endDateTo',
    });

    if (startDateFrom && endDateFrom && startDateFrom !== endDateFrom) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '日期筛选参数冲突：startDateFrom 与 endDateFrom 不一致',
        { startDateFrom, endDateFrom },
      );
    }

    if (startDateTo && endDateTo && startDateTo !== endDateTo) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        '日期筛选参数冲突：startDateTo 与 endDateTo 不一致',
        { startDateTo, endDateTo },
      );
    }

    const queryStart = startDateFrom ?? endDateFrom;
    const queryEnd = startDateTo ?? endDateTo;
    if (queryStart && queryEnd && queryStart > queryEnd) {
      throw new DomainError(COURSE_SERIES_ERROR.INVALID_PARAMS, '日期筛选参数冲突：起止范围非法', {
        queryStart,
        queryEnd,
      });
    }
  }

  /**
   * 规范化并校验日期筛选字段。
   * @param params 参数对象：value, field
   * @returns 规范化后的日期字符串（YYYY-MM-DD）；无值返回 undefined
   */
  private normalizeDateFilterValue(params: {
    readonly value?: string;
    readonly field: 'startDateFrom' | 'endDateFrom' | 'startDateTo' | 'endDateTo';
  }): string | undefined {
    if (typeof params.value !== 'string') return undefined;
    const trimmed = trimText(params.value);
    if (!trimmed) return undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new DomainError(
        COURSE_SERIES_ERROR.INVALID_PARAMS,
        `日期筛选参数格式非法：${params.field}`,
        { field: params.field, value: params.value },
      );
    }
    return trimmed;
  }

  /**
   * 权限校验：仅允许 admin / manager / coach
   */
  private ensurePermissions(session: UsecaseSession): void {
    const ok =
      hasRole(session.roles, IdentityTypeEnum.ADMIN) ||
      hasRole(session.roles, IdentityTypeEnum.MANAGER) ||
      hasRole(session.roles, IdentityTypeEnum.COACH);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权搜索开课班');
    }
  }

  /**
   * 当操作者为 coach 时，仅允许检索自身发布的系列
   */
  private async getCoachPublisherFilter(session: UsecaseSession): Promise<{
    readonly publisherType: PublisherType;
    readonly publisherId: number;
  }> {
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Coach 身份');
    }
    return { publisherType: PublisherType.COACH, publisherId: coach.id };
  }
}
