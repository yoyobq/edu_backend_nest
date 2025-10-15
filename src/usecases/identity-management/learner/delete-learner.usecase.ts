// src/usecases/learner/delete-learner.usecase.ts

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';

/**
 * 删除学员信息用例（软删除）
 *
 * 功能：
 * - 权限校验：确保当前用户是 Customer 且只能删除自己名下的学员
 * - 软删除：设置 deactivatedAt 字段而不是物理删除
 * - 事务保证：所有操作在单事务内完成
 * - 幂等性：重复删除不报错
 */
@Injectable()
export class DeleteLearnerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行删除学员信息（软删除）
   * @param customerAccountId 当前登录的客户账户 ID
   * @param learnerId 要删除的学员 ID
   * @returns 删除操作是否成功
   */
  async execute(customerAccountId: number, learnerId: number): Promise<boolean> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. 权限校验：验证当前用户是 Customer
      const customer = await this.customerService.findByAccountId(customerAccountId);
      if (!customer) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '只有客户可以删除学员信息');
      }

      // 2. 查找学员并验证所有权
      const learner = await manager.getRepository(LearnerEntity).findOne({
        where: {
          id: learnerId,
          customerId: customer.id,
        },
      });

      if (!learner) {
        throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或不属于当前用户');
      }

      // 3. 幂等性检查：如果已经被软删除，直接返回成功
      if (learner.deactivatedAt) {
        return true; // 幂等：已删除直接返回成功
      }

      // 4. 执行软删除
      const now = new Date();
      const updateResult = await manager.getRepository(LearnerEntity).update(learnerId, {
        deactivatedAt: now,
        updatedBy: customerAccountId,
        updatedAt: now,
      });

      if (updateResult.affected === 0) {
        throw new DomainError(LEARNER_ERROR.LEARNER_DELETE_FAILED, '删除学员信息失败');
      }

      return true;
    });
  }
}
