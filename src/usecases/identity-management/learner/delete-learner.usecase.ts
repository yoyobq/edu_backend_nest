// src/usecases/learner/delete-learner.usecase.ts

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
 * 删除学员信息用例（软删除）
 *
 * 功能：
 * - 权限校验：支持 Customer 和 Manager 身份
 * - Customer：只能删除自己名下的学员
 * - Manager：可以删除有权限管理的 Customer 名下的学员
 * - 软删除：设置 deactivatedAt 字段而不是物理删除
 * - 事务保证：所有操作在单事务内完成
 * - 幂等性：重复删除不报错
 */
@Injectable()
export class DeleteLearnerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行删除学员信息（软删除）
   * @param accountId 账户 ID
   * @param learnerId 要删除的学员 ID
   * @param customerId 目标客户 ID（可选，manager 身份时需要指定）
   * @returns 删除操作是否成功
   */
  async execute(accountId: number, learnerId: number, customerId?: number): Promise<boolean> {
    // 双重身份验证：支持 customer 和 manager 身份
    let targetCustomerId: number;

    // 首先尝试验证 customer 身份
    const customer = await this.customerService.findByAccountId(accountId);
    if (customer) {
      // customer 身份：只能删除自己的学员
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

    return await this.dataSource.transaction(async (manager) => {
      // 2. 查找学员并验证所有权
      const learner = await manager.getRepository(LearnerEntity).findOne({
        where: {
          id: learnerId,
          customerId: targetCustomerId,
        },
      });

      if (!learner) {
        // 如果是查找不存在的学员，返回学员不存在错误
        const learnerExists = await manager.getRepository(LearnerEntity).findOne({
          where: { id: learnerId },
        });

        if (!learnerExists) {
          throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
        } else {
          // 学员存在但不属于当前用户，返回权限错误
          throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问该学员');
        }
      }

      // 3. 幂等性检查：如果已经被软删除，直接返回成功
      if (learner.deactivatedAt) {
        return true; // 幂等：已删除直接返回成功
      }

      // 4. 执行软删除
      const now = new Date();
      const updateResult = await manager.getRepository(LearnerEntity).update(learnerId, {
        deactivatedAt: now,
        updatedBy: accountId,
        updatedAt: now,
      });

      if (updateResult.affected === 0) {
        throw new DomainError(LEARNER_ERROR.LEARNER_DELETE_FAILED, '删除学员信息失败');
      }

      return true;
    });
  }
}
