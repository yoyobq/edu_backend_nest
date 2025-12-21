// src/usecases/course/sessions/view-sessions-by-series.usecase.ts
import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import {
  ListSessionsBySeriesQuery,
  ListSessionsBySeriesUsecase,
} from '@src/usecases/course/sessions/list-sessions-by-series.usecase';

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * 按开课班（CourseSeries）查看节次列表用例（带权限与可见性裁剪）
 *
 * - admin/manager：可访问任意 series
 * - customer：仅可访问「可见」或「已报名」的 series
 */
@Injectable()
export class ViewSessionsBySeriesUsecase {
  constructor(
    private readonly listSessionsBySeriesUsecase: ListSessionsBySeriesUsecase,
    private readonly seriesService: CourseSeriesService,
    private readonly customerService: CustomerService,
    private readonly enrollmentService: ParticipationEnrollmentService,
  ) {}

  /**
   * 带权限与可见性裁剪地读取节次列表
   * @param session 用例会话
   * @param query 查询参数
   * @returns 节次实体列表
   */
  async execute(
    session: UsecaseSession,
    query: ListSessionsBySeriesQuery,
  ): Promise<CourseSessionEntity[]> {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);

    if (isAdmin || isManager) {
      return await this.listSessionsBySeriesUsecase.execute(query);
    }

    if (!isCustomer) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [
          IdentityTypeEnum.ADMIN,
          IdentityTypeEnum.MANAGER,
          IdentityTypeEnum.CUSTOMER,
        ],
        userRoles: session.roles,
      });
    }

    const seriesInfo = await this.seriesService.findAccessInfoById({ seriesId: query.seriesId });
    if (!seriesInfo) return [];

    const today = toLocalDateString(new Date());
    const isPublished = seriesInfo.status === CourseSeriesStatus.PUBLISHED;
    const isVisible = isPublished && today <= seriesInfo.endDate;
    const customer = await this.customerService.findByAccountId(session.accountId);
    const hasEnrollment =
      customer?.id != null
        ? await this.enrollmentService.hasActiveEnrollmentInSeries({
            customerId: customer.id,
            seriesId: query.seriesId,
          })
        : false;

    if (!isVisible && !hasEnrollment) {
      return [];
    }

    return await this.listSessionsBySeriesUsecase.execute(query);
  }
}
