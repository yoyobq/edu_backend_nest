// src/usecases/course/sessions/course-series-access.policy.ts
import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

@Injectable()
export class CourseSeriesAccessPolicy {
  constructor(
    private readonly seriesService: CourseSeriesService,
    private readonly customerService: CustomerService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 判定当前会话是否可以访问指定开课班下的节次列表
   * @param session 用例会话
   * @param seriesId 开课班 ID
   * @returns 是否允许访问（允许访问时返回 true；仅对 customer 视角的“不可见且未报名”返回 false）
   */
  async canAccessSeriesSessions(params: {
    readonly session: UsecaseSession;
    readonly seriesId: number;
  }): Promise<boolean> {
    const { session, seriesId } = params;

    const isCoach = hasRole(session.roles, IdentityTypeEnum.COACH);
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);

    let canAccessAsCoach = false;
    if (isCoach) {
      canAccessAsCoach = await this.isCoachBoundToSeries(session, seriesId);
      if (!isCustomer && !canAccessAsCoach) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该开课班的节次列表', {
          seriesId,
          role: 'COACH',
        });
      }
    }

    if (!isCustomer) {
      if (!canAccessAsCoach) {
        return false;
      }
      return true;
    }

    if (canAccessAsCoach) {
      return true;
    }

    const seriesInfo = await this.seriesService.findAccessInfoById({ seriesId });
    if (!seriesInfo) {
      return false;
    }

    const today = toLocalDateString(new Date());
    const isPublished = seriesInfo.status === CourseSeriesStatus.PUBLISHED;
    const isVisible = isPublished && today <= seriesInfo.endDate;
    const customer = await this.customerService.findByAccountId(session.accountId);
    const hasEnrollment =
      customer?.id != null
        ? await this.enrollmentService.hasActiveEnrollmentInSeries({
            customerId: customer.id,
            seriesId,
          })
        : false;

    const canAccessAsCustomer = isVisible || hasEnrollment;

    return canAccessAsCustomer;
  }

  /**
   * 判断当前会话是否为与指定开课班相关的教练
   * @param session 用例会话
   * @param seriesId 开课班 ID
   * @returns 是否与该开课班存在教练关联
   */
  private async isCoachBoundToSeries(session: UsecaseSession, seriesId: number): Promise<boolean> {
    if (!session.accountId) return false;

    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach || coach.deactivatedAt !== null) {
      return false;
    }

    return await this.sessionCoachesService.existsCoachBoundToSeries({
      seriesId,
      coachId: coach.id,
    });
  }
}
