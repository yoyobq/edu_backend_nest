// 文件位置： src/usecases/course/workflows/has-customer-enrollment-by-series.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';

export interface HasCustomerEnrollmentBySeriesInput {
  readonly session: UsecaseSession;
  readonly seriesId: number;
  readonly customerId: number;
}

export interface HasCustomerEnrollmentBySeriesOutput {
  readonly hasEnrollment: boolean;
}

/**
 * 判断 customer 在指定 series 下是否存在有效预约
 *
 * 规则：
 * - 允许 customer 查询自身客户
 * - 允许 manager / admin 查询其可管理的客户
 */
@Injectable()
export class HasCustomerEnrollmentBySeriesUsecase {
  constructor(
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行查询
   * @param input 会话与查询参数
   * @returns 是否存在有效预约
   */
  async execute(
    input: HasCustomerEnrollmentBySeriesInput,
  ): Promise<HasCustomerEnrollmentBySeriesOutput> {
    const customer = await this.requireCustomer(input.customerId);
    await this.assertAccess({ session: input.session, customerId: customer.id });
    const hasEnrollment = await this.enrollmentService.hasActiveEnrollmentInSeries({
      customerId: customer.id,
      seriesId: input.seriesId,
    });
    return { hasEnrollment };
  }

  /**
   * 读取 customer 并校验存在性
   * @param customerId 客户 ID
   * @returns 客户实体
   */
  private async requireCustomer(customerId: number) {
    const customer = await this.customerService.findById(customerId);
    if (!customer || customer.deactivatedAt) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在或已被删除');
    }
    return customer;
  }

  /**
   * 权限校验：customer 仅可访问自身客户，manager / admin 需具备管理权限
   * @param params 用例会话与客户 ID
   */
  private async assertAccess(params: {
    readonly session: UsecaseSession;
    readonly customerId: number;
  }): Promise<void> {
    const isCustomer = hasRole(params.session.roles, IdentityTypeEnum.CUSTOMER);
    const isManager = hasRole(params.session.roles, IdentityTypeEnum.MANAGER);
    const isAdmin = hasRole(params.session.roles, IdentityTypeEnum.ADMIN);

    if (!isCustomer && !isManager && !isAdmin) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色');
    }

    if (isAdmin) return;

    if (isManager) {
      const manager = await this.managerService.findByAccountId(params.session.accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Manager 身份');
      }
      const ok = await this.managerService.hasPermissionForCustomer(manager.id, params.customerId);
      if (!ok) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
      }
      return;
    }

    const customer = await this.customerService.findByAccountId(params.session.accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定 Customer 身份');
    }
    if (customer.id !== params.customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Customer 仅允许访问自身客户');
    }
  }
}
