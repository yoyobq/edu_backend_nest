import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface ListCurrentAccountEnrolledSessionIdsInput {
  readonly session: UsecaseSession;
}

export interface ListCurrentAccountEnrolledSessionItem {
  readonly sessionId: number;
  readonly learnerId: number;
  readonly learnerName: string;
}

export interface ListCurrentAccountEnrolledSessionIdsOutput {
  readonly sessionIds: number[];
  readonly items: ReadonlyArray<ListCurrentAccountEnrolledSessionItem>;
}

@Injectable()
export class ListCurrentAccountEnrolledSessionIdsUsecase {
  constructor(
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
  ) {}

  async execute(
    input: ListCurrentAccountEnrolledSessionIdsInput,
  ): Promise<ListCurrentAccountEnrolledSessionIdsOutput> {
    this.assertCustomerRole(input.session);
    const customer = await this.customerService.findByAccountId(input.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    const items = await this.enrollmentService.listActiveSessionItemsByCustomer({
      customerId: customer.id,
    });
    const sessionIds = Array.from(new Set(items.map((item) => item.sessionId)));
    return { sessionIds, items };
  }

  private assertCustomerRole(session: UsecaseSession): void {
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);
    if (!isCustomer) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色');
    }
  }
}
