// src/usecases/learner/update-learner.usecase.ts

import { Gender } from '@app-types/models/user-info.types';
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
 * 更新学员信息输入参数
 */
export interface UpdateLearnerInput {
  /** 学员 ID */
  id: number;
  /** 学员姓名 */
  name?: string;
  /** 性别 */
  gender?: Gender;
  /** 出生日期 */
  birthDate?: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 特殊需求 */
  specialNeeds?: string;
  /** 每次课程数量 */
  countPerSession?: number;
  /** 备注 */
  remark?: string;
}

/**
 * 更新学员信息用例
 *
 * 功能：
 * - 权限校验：确保当前用户是 Customer 且只能更新自己名下的学员
 * - 并发控制：使用悲观锁防止并发更新冲突
 * - 幂等性：相同内容更新不报错
 * - 事务保证：所有操作在单事务内完成
 */
@Injectable()
export class UpdateLearnerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行更新学员信息
   * @param customerAccountId 当前登录的客户账户 ID
   * @param input 更新输入参数
   * @returns 更新后的学员实体
   */
  async execute(customerAccountId: number, input: UpdateLearnerInput): Promise<LearnerEntity> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. 权限校验：验证当前用户是 Customer
      const customer = await this.customerService.findByAccountId(customerAccountId);
      if (!customer) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '只有客户可以更新学员信息');
      }

      // 2. 查找学员并验证所有权（使用悲观锁）
      const learner = await manager
        .getRepository(LearnerEntity)
        .createQueryBuilder('learner')
        .where('learner.id = :id AND learner.customerId = :customerId', {
          id: input.id,
          customerId: customer.id,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (!learner) {
        throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在或不属于当前用户');
      }

      // 3. 检查学员是否已被软删除
      if (learner.deactivatedAt) {
        throw new DomainError(LEARNER_ERROR.LEARNER_ALREADY_DELETED, '学员已被删除，无法更新');
      }

      // 4. 准备更新数据（过滤掉 undefined 值）
      const updateData: Partial<LearnerEntity> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.gender !== undefined) updateData.gender = input.gender;
      if (input.birthDate !== undefined) updateData.birthDate = input.birthDate;
      if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
      if (input.specialNeeds !== undefined) updateData.specialNeeds = input.specialNeeds;
      if (input.countPerSession !== undefined) updateData.countPerSession = input.countPerSession;
      if (input.remark !== undefined) updateData.remark = input.remark;

      // 5. 幂等性检查：如果没有实际变更，直接返回
      const hasChanges = Object.keys(updateData).some((key) => {
        const newValue = updateData[key as keyof typeof updateData];
        const oldValue = learner[key as keyof LearnerEntity];

        // 处理日期比较
        if (typeof newValue === 'string' && typeof oldValue === 'string') {
          return newValue !== oldValue;
        }

        return newValue !== oldValue;
      });

      if (!hasChanges) {
        return learner; // 幂等：无变更直接返回
      }

      // 6. 如果更新了姓名或生日，检查唯一性约束
      if (input.name !== undefined || input.birthDate !== undefined) {
        const checkName = input.name !== undefined ? input.name : learner.name;
        const checkBirthDate = input.birthDate !== undefined ? input.birthDate : learner.birthDate;

        const existingLearner = await manager
          .getRepository(LearnerEntity)
          .createQueryBuilder('learner')
          .where('learner.customerId = :customerId', { customerId: customer.id })
          .andWhere('learner.name = :name', { name: checkName })
          .andWhere('learner.birthDate = :birthDate', { birthDate: checkBirthDate })
          .andWhere('learner.deactivatedAt IS NULL')
          .andWhere('learner.id != :currentId', { currentId: input.id })
          .getOne();

        if (existingLearner) {
          throw new DomainError(
            LEARNER_ERROR.LEARNER_DUPLICATED,
            '同一客户下已存在相同姓名和生日的学员',
          );
        }
      }

      // 7. 执行更新
      updateData.updatedBy = customerAccountId;
      updateData.updatedAt = new Date();

      await manager.getRepository(LearnerEntity).update(input.id, updateData);

      // 8. 返回更新后的学员信息
      const updatedLearner = await manager.getRepository(LearnerEntity).findOne({
        where: { id: input.id },
      });

      if (!updatedLearner) {
        throw new DomainError(LEARNER_ERROR.LEARNER_UPDATE_FAILED, '更新学员信息失败');
      }

      return updatedLearner;
    });
  }
}
