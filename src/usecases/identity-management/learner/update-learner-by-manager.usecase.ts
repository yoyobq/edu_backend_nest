// 文件位置：src/usecases/identity-management/learner/update-learner-by-manager.usecase.ts

import { Gender } from '@app-types/models/user-info.types';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
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
 * 管理员更新学员信息输入参数
 */
export interface UpdateLearnerByManagerInput {
  readonly id: number;
  readonly customerId?: number; // manager 可选指定目标客户，不提供则自动解析
  readonly name?: string;
  readonly gender?: Gender;
  readonly birthDate?: string;
  readonly avatarUrl?: string;
  readonly specialNeeds?: string;
  readonly remark?: string;
  /** manager 额外权限：可修改字段 */
  readonly countPerSession?: number;
  /** manager 额外权限：可迁移学员归属 */
  readonly targetCustomerId?: number;
  /** manager 额外权限：可下线/恢复 */
  readonly deactivate?: boolean;
}

/**
 * 管理员更新学员信息用例（更高权限）
 *
 * 规则：
 * - 仅允许 Manager，且必须指定当前客户 `customerId`
 * - 字段权限：允许更新所有客户可改字段 + countPerSession
 * - 支持迁移学员归属（targetCustomerId）
 * - 支持停用/恢复（deactivate=true 表示下线；false 表示恢复）
 * - 幂等：无实际变更直接返回当前实体
 * - 事务：单事务执行更新与归属迁移
 */
@Injectable()
export class UpdateLearnerByManagerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行管理员更新学员信息
   * @param accountId 当前账户 ID（manager）
   * @param input 更新参数
   * @returns 更新后的学员实体
   */
  async execute(accountId: number, input: UpdateLearnerByManagerInput): Promise<LearnerEntity> {
    const manager = await this.managerService.findByAccountId(accountId);
    if (!manager) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');

    // 解析有效的当前客户 ID：优先使用输入参数，否则根据学员归属自动解析
    const { effectiveCustomerId, preFetchedLearner } = await this.resolveEffectiveCustomerId(input);

    // 目标客户存在性校验
    const currentCustomer = await this.customerService.findById(effectiveCustomerId);
    if (!currentCustomer) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');

    // 授权校验（当前实现：活跃即有权限）
    const hasPermission = await this.managerService.hasPermissionForCustomer(
      manager.id,
      effectiveCustomerId,
    );
    if (!hasPermission)
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');

    // 可选：迁移目标客户校验
    let migrateToCustomerId: number | undefined;
    if (input.targetCustomerId !== undefined) {
      const targetCust = await this.customerService.findById(input.targetCustomerId);
      if (!targetCust) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '迁移目标客户不存在');
      migrateToCustomerId = input.targetCustomerId;
    }

    return await this.dataSource.transaction(async (managerTx) => {
      const learner = preFetchedLearner
        ? preFetchedLearner
        : await this.validateLearnerAccess(input.id, effectiveCustomerId);

      // 构建更新 patch（manager 允许更多字段）
      const updateData = this.prepareUpdateData(input, accountId);

      // 迁移归属
      if (migrateToCustomerId !== undefined && migrateToCustomerId !== learner.customerId) {
        updateData.customerId = migrateToCustomerId;
      }

      // 停用/恢复
      if (input.deactivate === true) {
        updateData.deactivatedAt = new Date();
      } else if (input.deactivate === false) {
        updateData.deactivatedAt = null;
      }

      if (!this.hasDataChanges(updateData, learner)) return learner;

      if (input.name !== undefined || input.birthDate !== undefined) {
        const targetId = updateData.customerId ?? learner.customerId;
        await this.validateUniqueness(managerTx, input, learner, targetId);
      }

      return await this.performUpdate(managerTx, input.id, updateData);
    });
  }

  /**
   * 解析有效的当前客户 ID
   * - 若输入包含 `customerId`，直接使用
   * - 若未提供，则按 `learner.id` 查询并使用学员当前归属的 `customerId`
   */
  private async resolveEffectiveCustomerId(
    input: UpdateLearnerByManagerInput,
  ): Promise<{ effectiveCustomerId: number; preFetchedLearner?: LearnerEntity }> {
    if (input.customerId && input.customerId > 0) {
      return { effectiveCustomerId: input.customerId };
    }
    const learner = await this.learnerService.findById(input.id);
    if (!learner) throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    return { effectiveCustomerId: learner.customerId, preFetchedLearner: learner };
  }

  private async validateLearnerAccess(
    learnerId: number,
    currentCustomerId: number,
  ): Promise<LearnerEntity> {
    const learner = await this.learnerService.findById(learnerId);
    if (!learner) throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员不存在');
    if (learner.customerId !== currentCustomerId)
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问该学员');
    return learner;
  }

  private prepareUpdateData(
    input: UpdateLearnerByManagerInput,
    accountId: number,
  ): Partial<LearnerEntity> {
    const updateData: Partial<LearnerEntity> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.gender !== undefined) updateData.gender = input.gender;
    if (input.birthDate !== undefined) updateData.birthDate = input.birthDate;
    if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
    if (input.specialNeeds !== undefined) updateData.specialNeeds = input.specialNeeds;
    if (input.remark !== undefined) updateData.remark = input.remark;
    if (input.countPerSession !== undefined) updateData.countPerSession = input.countPerSession;
    updateData.updatedBy = accountId;
    updateData.updatedAt = new Date();
    return updateData;
  }

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

  private async validateUniqueness(
    manager: EntityManager,
    input: UpdateLearnerByManagerInput,
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

  private async performUpdate(
    manager: EntityManager,
    learnerId: number,
    updateData: Partial<LearnerEntity>,
  ): Promise<LearnerEntity> {
    await manager.getRepository(LearnerEntity).update(learnerId, updateData);
    const updated = await manager
      .getRepository(LearnerEntity)
      .findOne({ where: { id: learnerId } });
    if (!updated) throw new DomainError(LEARNER_ERROR.LEARNER_UPDATE_FAILED, '更新学员信息失败');
    return updated;
  }
}
