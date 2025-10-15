// src/usecases/learner/get-learner.usecase.ts

import { Injectable } from '@nestjs/common';
import {
  DomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';

/**
 * 获取学员信息用例
 *
 * 功能：
 * - 权限校验：确保当前用户是 Customer 且只能查看自己名下的学员
 * - 只返回未软删除的学员信息
 */
@Injectable()
export class GetLearnerUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行获取学员信息
   * @param customerAccountId 当前登录的客户账户 ID
   * @param learnerId 学员 ID
   * @returns 学员实体
   */
  async execute(customerAccountId: number, learnerId: number): Promise<LearnerEntity> {
    // 1. 权限校验：验证当前用户是 Customer
    const customer = await this.customerService.findByAccountId(customerAccountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '只有客户可以查看学员信息');
    }

    // 2. 查找学员
    const learner = await this.learnerService.findById(learnerId);

    if (!learner) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    }

    // 3. 验证所有权
    if (learner.customerId !== customer.id) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或不属于当前用户');
    }

    // 4. 检查学员是否已被软删除
    if (learner.deactivatedAt) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或已被删除');
    }

    return learner;
  }
}
