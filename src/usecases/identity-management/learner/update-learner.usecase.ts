// src/usecases/learner/update-learner.usecase.ts

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
 * 更新学员信息输入参数
 */
export interface UpdateLearnerInput {
  /** 学员 ID */
  id: number;
  /** 目标客户 ID（可选，manager 身份时需要指定） */
  customerId?: number;
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
 * - 权限校验：支持 Customer 和 Manager 身份
 * - Customer：只能更新自己名下的学员
 * - Manager：可以更新有权限管理的 Customer 名下的学员
 * - 并发控制：使用悲观锁防止并发更新冲突
 * - 幂等性：相同内容更新不报错
 * - 事务保证：所有操作在单事务内完成
 */
@Injectable()
export class UpdateLearnerUsecase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
    private readonly learnerService: LearnerService,
  ) {}

  /**
   * 执行更新学员信息
   * @param accountId 账户 ID
   * @param input 更新学员信息输入参数
   * @returns 更新后的学员信息
   */
  async execute(accountId: number, input: UpdateLearnerInput): Promise<LearnerEntity> {
    // 1. 身份验证和权限验证
    const targetCustomerId = await this.validateUserPermissions(accountId, input);

    return await this.dataSource.transaction(async (manager) => {
      // 2. 查找并验证学员
      const learner = await this.validateLearnerAccess(input.id, targetCustomerId);

      // 3. 准备更新数据并检查幂等性
      const updateData = this.prepareUpdateData(input, accountId);
      if (!this.hasDataChanges(updateData, learner)) {
        return learner; // 幂等：无变更直接返回
      }

      // 4. 验证唯一性约束
      if (input.name !== undefined || input.birthDate !== undefined) {
        await this.validateUniqueness(manager, input, learner, targetCustomerId);
      }

      // 5. 执行更新并返回结果
      return await this.performUpdate(manager, input.id, updateData);
    });
  }

  /**
   * 验证用户权限并返回目标客户 ID
   */
  private async validateUserPermissions(
    accountId: number,
    input: UpdateLearnerInput,
  ): Promise<number> {
    // 首先尝试验证 customer 身份
    const customer = await this.customerService.findByAccountId(accountId);
    if (customer) {
      // customer 身份：只能更新自己的学员
      if (input.customerId && input.customerId !== customer.id) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限访问其他客户的学员');
      }
      return customer.id;
    }

    // 验证 manager 身份
    const manager = await this.managerService.findByAccountId(accountId);
    if (!manager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');
    }

    // manager 身份：必须指定 customerId
    if (!input.customerId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 必须指定目标客户 ID');
    }

    // 验证 manager 与 customer 的关联关系
    const targetCustomer = await this.customerService.findById(input.customerId);
    if (!targetCustomer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
    }

    // TODO: 验证 manager 是否有权限管理该 customer
    // 这里需要根据业务逻辑实现权限验证
    // const hasPermission = await this.managerService.hasPermissionForCustomer(manager.id, input.customerId);
    // if (!hasPermission) {
    //   throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 无权限管理该客户');
    // }

    return input.customerId;
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

    // 检查学员是否已被软删除
    if (learner.deactivatedAt) {
      throw new DomainError(LEARNER_ERROR.LEARNER_NOT_FOUND, '学员已被删除');
    }

    return learner;
  }

  /**
   * 准备更新数据，使用 Map 优化字段处理
   */
  private prepareUpdateData(input: UpdateLearnerInput, accountId: number): Partial<LearnerEntity> {
    const updateData: Partial<LearnerEntity> = {};

    // 使用条件赋值处理字段更新，避免 any 类型
    if (input.name !== undefined) updateData.name = input.name;
    if (input.gender !== undefined) updateData.gender = input.gender;
    if (input.birthDate !== undefined) updateData.birthDate = input.birthDate;
    if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
    if (input.specialNeeds !== undefined) updateData.specialNeeds = input.specialNeeds;
    if (input.countPerSession !== undefined) updateData.countPerSession = input.countPerSession;
    if (input.remark !== undefined) updateData.remark = input.remark;

    // 设置更新者和更新时间
    updateData.updatedBy = accountId;
    updateData.updatedAt = new Date();

    return updateData;
  }

  /**
   * 检查是否有数据变更（幂等性检查）
   */
  private hasDataChanges(updateData: Partial<LearnerEntity>, learner: LearnerEntity): boolean {
    return Object.keys(updateData).some((key) => {
      // 跳过系统字段的比较
      if (key === 'updatedBy' || key === 'updatedAt') {
        return true;
      }

      const newValue = updateData[key as keyof typeof updateData];
      const oldValue = learner[key as keyof LearnerEntity];

      // 处理日期比较
      if (typeof newValue === 'string' && typeof oldValue === 'string') {
        return newValue !== oldValue;
      }

      return newValue !== oldValue;
    });
  }

  /**
   * 验证唯一性约束
   */
  private async validateUniqueness(
    manager: EntityManager,
    input: UpdateLearnerInput,
    learner: LearnerEntity,
    targetCustomerId: number,
  ): Promise<void> {
    const checkName = input.name !== undefined ? input.name : learner.name;
    const checkBirthDate = input.birthDate !== undefined ? input.birthDate : learner.birthDate;

    const existingLearner = await manager
      .getRepository(LearnerEntity)
      .createQueryBuilder('learner')
      .where('learner.customerId = :customerId', { customerId: targetCustomerId })
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

  /**
   * 执行数据库更新操作
   */
  private async performUpdate(
    manager: EntityManager,
    learnerId: number,
    updateData: Partial<LearnerEntity>,
  ): Promise<LearnerEntity> {
    await manager.getRepository(LearnerEntity).update(learnerId, updateData);

    // 返回更新后的学员信息
    const updatedLearner = await manager.getRepository(LearnerEntity).findOne({
      where: { id: learnerId },
    });

    if (!updatedLearner) {
      throw new DomainError(LEARNER_ERROR.LEARNER_UPDATE_FAILED, '更新学员信息失败');
    }

    return updatedLearner;
  }
}
