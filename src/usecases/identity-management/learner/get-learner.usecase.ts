// src/usecases/learner/get-learner.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import {
  DomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';
import { ManagerService } from '../../../modules/account/identities/training/manager/manager.service';

/**
 * 获取学员信息用例
 *
 * 功能：
 * - 权限校验：支持 Customer 和 Manager 身份
 * - Customer：只能查看自己名下的学员
 * - Manager：可以查看有权限管理的 Customer 名下的学员
 * - 只返回未软删除的学员信息
 */
@Injectable()
export class GetLearnerUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行获取学员信息
   * @param accountId 账户 ID
   * @param learnerId 学员 ID
   * @param customerId 目标客户 ID（可选，manager 身份时需要指定）
   * @returns 学员实体
   */
  /**
   * 执行获取学员信息
   * - 对于 manager：允许不指定 customerId，自动容错为“按学员归属客户判定权限”，避免 UX 不友好
   * - 对于 customer：仍只能查看自己名下学员
   * - 对于同时具备多身份的账户：根据 activeRole 优先选择分支
   */
  async execute(
    accountId: number,
    learnerId: number,
    customerId?: number,
    activeRole?: IdentityTypeEnum | string | null,
  ): Promise<LearnerEntity> {
    const role = this.normalizeActiveRole(activeRole);
    const targetCustomerId =
      role === 'CUSTOMER'
        ? await this.resolveCustomerTarget(accountId, customerId)
        : await this.resolveManagerOrFallbackTarget(accountId, learnerId);

    const learner = await this.learnerService.findById(learnerId);
    if (!learner) throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    if (learner.customerId !== targetCustomerId)
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问该学员');
    if (learner.deactivatedAt)
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');
    return learner;
  }

  private async resolveCustomerTarget(accountId: number, customerId?: number): Promise<number> {
    const customer = await this.customerService.findByAccountId(accountId);
    if (!customer) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定客户身份');
    if (customerId && customerId !== customer.id)
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问其他客户的学员');
    return customer.id;
  }

  private async resolveManagerOrFallbackTarget(
    accountId: number,
    learnerId: number,
  ): Promise<number> {
    const manager = await this.managerService.findByAccountId(accountId);
    if (!manager) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');

    const temp = await this.learnerService.findById(learnerId);
    if (!temp) throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    if (temp.deactivatedAt)
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');

    const ok = await this.managerService.hasPermissionForCustomer(manager.id, temp.customerId);
    if (!ok) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
    return temp.customerId;
  }

  /**
   * 归一化 activeRole
   */
  private normalizeActiveRole(
    activeRole?: IdentityTypeEnum | string | null,
  ): 'MANAGER' | 'CUSTOMER' | null {
    if (activeRole == null) return null;
    const v =
      typeof activeRole === 'string' ? activeRole.toUpperCase() : String(activeRole).toUpperCase();
    if (v === 'MANAGER') return 'MANAGER';
    if (v === 'CUSTOMER') return 'CUSTOMER';
    return null;
  }
}
