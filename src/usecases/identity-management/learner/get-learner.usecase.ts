// src/usecases/learner/get-learner.usecase.ts

import { Injectable } from '@nestjs/common';
import {
  DomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '../../../modules/account/identities/training/manager/manager.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';

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
  async execute(accountId: number, learnerId: number, customerId?: number): Promise<LearnerEntity> {
    // 双重身份验证：支持 customer 和 manager 身份
    let targetCustomerId: number;

    // 首先尝试验证 customer 身份
    const customer = await this.customerService.findByAccountId(accountId);
    if (customer) {
      // customer 身份：只能查看自己的学员
      if (customerId && customerId !== customer.id) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问其他客户的学员');
      }
      targetCustomerId = customer.id;
    } else {
      // 验证 manager 身份
      const manager = await this.managerService.findByAccountId(accountId);
      if (!manager) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');
      }

      // manager 身份：必须指定 customerId
      if (!customerId) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 必须指定目标客户 ID');
      }

      // 验证 manager 与 customer 的关联关系
      const targetCustomer = await this.customerService.findById(customerId);
      if (!targetCustomer) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
      }

      // TODO: 验证 manager 是否有权限管理该 customer
      // 这里需要根据业务逻辑实现权限验证
      // const hasPermission = await this.managerService.hasPermissionForCustomer(manager.id, customerId);
      // if (!hasPermission) {
      //   throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
      // }

      targetCustomerId = customerId;
    }

    // 2. 查找学员
    const learner = await this.learnerService.findById(learnerId);

    if (!learner) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    }

    // 3. 验证所有权
    if (learner.customerId !== targetCustomerId) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或不属于当前用户');
    }

    // 4. 检查学员是否已被软删除
    if (learner.deactivatedAt) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');
    }

    return learner;
  }
}
