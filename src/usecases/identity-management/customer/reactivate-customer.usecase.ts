// src/usecases/identity-management/customer/reactivate-customer.usecase.ts

import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CustomerEntity } from '@modules/account/identities/training/customer/account-customer.entity';
import { CustomerService } from '@modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 上线客户输入参数
 */
export interface ReactivateCustomerParams {
  /** 客户 ID */
  id: number;
}

/**
 * 上线客户输出结果
 */
export interface ReactivateCustomerResult {
  /** 更新后的客户实体 */
  customer: CustomerEntity;
  /** 是否发生状态变更（幂等为 false） */
  isUpdated: boolean;
}

/**
 * 上线客户用例
 * 规则：仅 manager 可以执行；幂等支持：若已上线则直接返回。
 */
@Injectable()
export class ReactivateCustomerUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行上线操作
   * @param currentAccountId 当前用户账户 ID
   * @param input 上线参数
   * @returns 上线结果
   */
  async execute(
    currentAccountId: number,
    input: ReactivateCustomerParams,
  ): Promise<ReactivateCustomerResult> {
    // 权限：仅 manager 身份
    const manager = await this.managerService.findByAccountId(currentAccountId);
    if (!manager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可以上线客户');
    }

    // 查找客户
    const entity = await this.customerService.findById(input.id);
    if (!entity) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在');
    }

    // 幂等：已上线直接返回
    if (!entity.deactivatedAt) {
      return { customer: entity, isUpdated: false };
    }

    const now = new Date();

    // 单事务更新，写入审计字段
    await this.dataSource.transaction(async (managerTx) => {
      await managerTx.getRepository(CustomerEntity).update(entity.id, {
        deactivatedAt: null,
        updatedBy: currentAccountId,
        updatedAt: now,
      });
    });

    const updated = await this.customerService.findById(entity.id);
    if (!updated) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '上线客户失败');
    }
    return { customer: updated, isUpdated: true };
  }
}
