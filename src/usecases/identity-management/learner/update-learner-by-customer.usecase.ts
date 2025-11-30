// 文件位置：src/usecases/identity-management/learner/update-learner-by-customer.usecase.ts

import { Gender } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DomainError,
  LEARNER_ERROR,
  PERMISSION_ERROR,
} from '../../../core/common/errors/domain-error';
import { CustomerService } from '../../../modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '../../../modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '../../../modules/account/identities/training/learner/account-learner.service';

/**
 * 客户更新学员信息输入参数
 */
export interface UpdateLearnerByCustomerInput {
  readonly id: number;
  readonly customerId?: number;
  readonly name?: string;
  readonly gender?: Gender;
  readonly birthDate?: string;
  readonly avatarUrl?: string;
  readonly specialNeeds?: string;
  readonly remark?: string;
  /**
   * 客户无权限修改：每次课程数量
   * 若传入则抛出无权限错误
   */
  readonly countPerSession?: number;
}

/**
 * 客户更新学员信息用例
 *
 * 规则：
 * - 仅允许 Customer 更新自己名下学员
 * - 字段权限：允许更新 name/gender/birthDate/avatarUrl/specialNeeds/remark
 * - 禁止更新 countPerSession/customerId/deactivatedAt
 * - 幂等：无实际变更直接返回当前实体
 * - 事务：单事务执行更新并回读
 */
@Injectable()
export class UpdateLearnerByCustomerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行客户更新学员信息
   * @param accountId 当前账户 ID（客户）
   * @param input 更新参数
   * @returns 更新后的学员实体
   */
  async execute(accountId: number, input: UpdateLearnerByCustomerInput): Promise<LearnerEntity> {
    // 字段权限快速拦截
    if (input.countPerSession !== undefined) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限修改该字段: countPerSession');
    }

    // 身份与目标客户解析
    const customer = await this.customerService.findByAccountId(accountId);
    if (!customer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');
    }
    if (input.customerId && input.customerId !== customer.id) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问其他客户的学员');
    }
    const targetCustomerId = customer.id;

    return await this.dataSource.transaction(async (manager) => {
      const learner = await this.validateLearnerAccess(input.id, targetCustomerId);

      const updateData = this.prepareUpdateData(input, accountId);
      if (!this.hasDataChanges(updateData, learner)) return learner;

      if (input.name !== undefined || input.birthDate !== undefined) {
        await this.validateUniqueness(manager, input, learner, targetCustomerId);
      }

      return await this.performUpdate(manager, input.id, updateData);
    });
  }

  /**
   * 验证学员访问权限
   */
  private async validateLearnerAccess(
    learnerId: number,
    targetCustomerId: number,
  ): Promise<LearnerEntity> {
    const learner = await this.learnerService.findById(learnerId);
    if (!learner) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    }
    if (learner.customerId !== targetCustomerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问该学员');
    }
    if (learner.deactivatedAt) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员已被删除');
    }
    return learner;
  }

  /**
   * 准备更新数据（按客户可更新字段）
   */
  private prepareUpdateData(
    input: UpdateLearnerByCustomerInput,
    accountId: number,
  ): Partial<LearnerEntity> {
    const updateData: Partial<LearnerEntity> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.gender !== undefined) updateData.gender = input.gender;
    if (input.birthDate !== undefined) updateData.birthDate = input.birthDate;
    if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
    if (input.specialNeeds !== undefined) updateData.specialNeeds = input.specialNeeds;
    if (input.remark !== undefined) updateData.remark = input.remark;
    updateData.updatedBy = accountId;
    updateData.updatedAt = new Date();
    return updateData;
  }

  /**
   * 幂等检查
   */
  private hasDataChanges(updateData: Partial<LearnerEntity>, learner: LearnerEntity): boolean {
    return Object.keys(updateData).some((key) => {
      if (key === 'updatedBy' || key === 'updatedAt') return true;
      const newValue = updateData[key as keyof typeof updateData];
      const oldValue = learner[key as keyof LearnerEntity];
      if (typeof newValue === 'string' && typeof oldValue === 'string') {
        return newValue !== oldValue;
      }
      return newValue !== oldValue;
    });
  }

  /**
   * 唯一性校验（同客户下 name + birthDate 不重复）
   */
  private async validateUniqueness(
    manager: EntityManager,
    input: UpdateLearnerByCustomerInput,
    learner: LearnerEntity,
    targetCustomerId: number,
  ): Promise<void> {
    const checkName = input.name !== undefined ? input.name : learner.name;
    const checkBirthDate = input.birthDate !== undefined ? input.birthDate : learner.birthDate;

    const existing = await manager
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.customerId = :customerId', { customerId: targetCustomerId })
      .andWhere('learner.name = :name', { name: checkName })
      .andWhere('learner.birthDate = :birthDate', { birthDate: checkBirthDate })
      .andWhere('learner.deactivatedAt IS NULL')
      .andWhere('learner.id != :currentId', { currentId: input.id })
      .getOne();

    if (existing) {
      throw new DomainError(
        LEARNER_ERROR.LEARNER_DUPLICATED,
        '同一客户下已存在相同姓名和生日的学员',
      );
    }
  }

  /**
   * 执行数据库更新并返回最新实体
   */
  private async performUpdate(
    manager: EntityManager,
    learnerId: number,
    updateData: Partial<LearnerEntity>,
  ): Promise<LearnerEntity> {
    await manager.getRepository(LearnerEntity).update(learnerId, updateData);
    const updated = await manager
      .getRepository(LearnerEntity)
      .findOne({ where: { id: learnerId } });
    if (!updated) {
      throw new DomainError(LEARNER_ERROR.LEARNER_UPDATE_FAILED, '更新学员信息失败');
    }
    return updated;
  }
}
