import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListCurrentAccountEnrolledSeriesIdsInput {
  readonly session: UsecaseSession;
}

export interface ListCurrentAccountEnrolledSeriesIdsOutput {
  readonly seriesIds: number[];
}

@Injectable()
export class ListCurrentAccountEnrolledSeriesIdsUsecase {
  constructor(
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
  ) {}

  async execute(
    input: ListCurrentAccountEnrolledSeriesIdsInput,
  ): Promise<ListCurrentAccountEnrolledSeriesIdsOutput> {
    this.assertCustomerRole(input.session);
    const customer = await this.customerService.findByAccountId(input.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    const seriesIds = await this.enrollmentService.listActiveSeriesIdsByCustomer({
      customerId: customer.id,
    });
    return { seriesIds };
  }

  private assertCustomerRole(session: UsecaseSession): void {
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);
    if (!isCustomer) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色');
    }
  }
}
