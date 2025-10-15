// src/usecases/identity-management/learner/create-learner.usecase.ts

import { Gender } from '@app-types/models/user-info.types';
import { DomainError, LEARNER_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CustomerService } from '@modules/account/identities/training/customer/account-customer.service';
import { LearnerEntity } from '@modules/account/identities/training/learner/account-learner.entity';
import { LearnerService } from '@modules/account/identities/training/learner/account-learner.service';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/**
 * 创建学员用例参数
 */
export interface CreateLearnerUsecaseParams {
  /** 当前用户账户 ID */
  currentAccountId: number;
  /** 学员姓名 */
  name: string;
  /** 性别（可选） */
  gender?: Gender;
  /** 出生日期（可选） */
  birthDate?: string | null;
  /** 头像 URL（可选） */
  avatarUrl?: string | null;
  /** 特殊需求（可选） */
  specialNeeds?: string | null;
  /** 备注（可选） */
  remark?: string | null;
  /** 每节课人数（可选，默认 1.0） */
  countPerSession?: number;
  /** 外部事务管理器（可选） */
  manager?: EntityManager;
}

/**
 * 创建学员用例结果
 */
export interface CreateLearnerUsecaseResult {
  /** 创建的学员实体 */
  learner: LearnerEntity;
  /** 是否为新创建（false 表示已存在） */
  isNewlyCreated: boolean;
}

/**
 * 创建学员用例
 * 允许已登录的 Customer 创建并登记 Learner 信息
 */
@Injectable()
export class CreateLearnerUsecase {
  constructor(
    private readonly learnerService: LearnerService,
    private readonly customerService: CustomerService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * 执行创建学员操作
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(
    params: CreateLearnerUsecaseParams,
    _manager?: EntityManager,
  ): Promise<CreateLearnerUsecaseResult> {
    const { currentAccountId, name, gender, birthDate, avatarUrl, specialNeeds, remark } = params;

    return await this.dataSource.transaction(async (_manager: EntityManager) => {
      // 1. 权限校验：验证当前用户是 Customer
      const customer = await this.customerService.findByAccountId(currentAccountId);
      if (!customer) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '只有客户可以创建学员信息');
      }

      // 2. 检查是否已存在同名学员（同一客户下）
      const existingLearner = await this.learnerService.findByNameAndCustomerId({
        name,
        customerId: customer.id,
      });

      if (existingLearner) {
        throw new DomainError(LEARNER_ERROR.LEARNER_DUPLICATED, '该客户下已存在同名学员');
      }

      // 3. 创建学员信息
      const learner = await this.learnerService.create({
        customerId: customer.id,
        name,
        gender,
        birthDate,
        avatarUrl,
        specialNeeds,
        remark,
        countPerSession: 1, // 默认值
        createdBy: currentAccountId,
      });

      return { learner, isNewlyCreated: true };
    });
  }
}
