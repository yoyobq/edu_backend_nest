// 文件位置：src/usecases/course/series/search-series-for-customer.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  COURSE_SERIES_ERROR,
  DomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { trimText } from '@core/common/text/text.helper';
import type { PaginatedResult, PaginationParams } from '@core/pagination/pagination.types';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import {
  CourseSeriesService,
  type SearchCourseSeriesFilters,
} from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 开课班分页搜索用例（customer 安全视图）
 *
 * 规则：
 * - 仅允许 customer 访问
 * - 仅返回“可见”或“已报名”的开课班
 */
@Injectable()
export class SearchSeriesForCustomerUsecase {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * 执行分页搜索
   * @param args 查询参数对象（session + 分页参数 + 可选关键词）
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

    const customer = await this.customerService.findByAccountId(args.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }

    const normalizedFilters = this.normalizeFilters(args.params.filters);
    return await this.seriesService.searchSeriesForCustomer({
      params: args.params.pagination,
      query: args.params.query,
      filters: normalizedFilters,
      customerId: customer.id,
    });
  }

  /**
   * 权限校验：仅允许 customer
   * @param session 当前会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const ok = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);
    if (!ok) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权搜索开课班');
    }
  }

  /**
   * 规范化 customer 搜索过滤条件（避免 activeOnly 误伤已报名课程）
   * @param filters 过滤参数
   * @returns 规范化后的过滤参数
   */
  private normalizeFilters(
    filters?: SearchCourseSeriesFilters,
  ): SearchCourseSeriesFilters | undefined {
    if (!filters) return undefined;
    if (Array.isArray(filters.statuses) && filters.statuses.length > 0) return filters;
    if (filters.activeOnly === true) {
      return { ...filters, activeOnly: false };
    }
    return filters;
  }

  /**
   * 校验日期筛选字段
   * @param filters 过滤条件
   */
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
   * 规范化并校验日期筛选字段
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
}
