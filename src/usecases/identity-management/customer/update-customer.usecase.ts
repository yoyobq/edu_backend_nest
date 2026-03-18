// src/usecases/identity-management/customer/update-customer.usecase.ts

import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import {
  CustomerService,
  type CustomerProfile,
} from '@modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { normalizeUpdateCustomerInput } from './customer.input.normalize';

type CustomerView = CustomerProfile;

type CustomerUpdatePatch = {
  name?: string;
  contactPhone?: string | null;
  preferredContactTime?: string | null;
  remark?: string | null;
  updatedBy?: number | null;
  updatedAt?: Date;
};

/**
 * 更新客户信息用例的输入参数
 */
export interface UpdateCustomerUsecaseParams {
  /** 当前用户账户 ID */
  currentAccountId: number;
  /** 目标客户 ID（可选，manager 身份时必须指定） */
  customerId?: number;
  /** 客户姓名（可选） */
  name?: string;
  /** 联系电话（可选，不需要唯一） */
  contactPhone?: string | null;
  /** 偏好联系时间（可选） */
  preferredContactTime?: string | null;
  /** 备注（可选） */
  remark?: string | null;
}

/**
 * 更新客户信息用例
 *
 * 规则：
 * - customer 身份：仅允许更新 upgrade 中出现的字段（name / contactPhone / preferredContactTime / remark），仅能操作自己的客户记录。
 * - manager 身份：必须指定 customerId，可更新上述字段。
 * - 幂等：无数据变更时直接返回当前实体。
 * - 事务：所有更新在单事务内完成，统一写入审计字段。
 */
@Injectable()
export class UpdateCustomerUsecase {
  constructor(
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行更新客户信息
   * @param params 更新参数
   * @returns 更新后的客户实体
   */
  async execute(params: UpdateCustomerUsecaseParams): Promise<CustomerView> {
    const { currentAccountId } = params;

    // 身份校验，确定目标客户 ID 以及允许更新的字段范围
    const ctx = await this.resolveIdentityContext(currentAccountId, params);

    // 事务内执行更新
    return await this.customerService.runTransaction<CustomerView>(async (manager) => {
      // 查找目标客户
      const customer = await this.customerService.findProfileByIdWithManager({
        id: ctx.targetCustomerId,
        manager,
      });
      if (!customer) {
        // 客户不存在（按项目现有风格，沿用权限错误或账户错误码）
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '客户不存在');
      }

      // 准备更新数据
      const updateData = this.prepareUpdateData({ ...params });

      // 幂等检查：无任何变更时直接返回
      if (!this.hasDataChanges(updateData, customer)) {
        return customer;
      }

      // 执行更新（显式更新审计字段）
      updateData.updatedBy = currentAccountId;
      updateData.updatedAt = new Date();
      const updated = await this.customerService.updateCustomerWithManager({
        id: customer.id,
        updateData,
        manager,
      });
      if (!updated) {
        // 理论上不会发生；若发生视为更新失败
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '更新客户信息失败');
      }
      return updated;
    });
  }

  /**
   * 解析身份上下文，返回目标客户 ID 以及权限范围
   * @param currentAccountId 当前账户 ID
   * @param params 用例参数
   * @returns 身份上下文
   */
  private async resolveIdentityContext(
    currentAccountId: number,
    params: UpdateCustomerUsecaseParams,
  ): Promise<{ targetCustomerId: number; isManager: boolean }> {
    // 先判定是否为 manager（优先级更高，避免同时具备 customer 身份时误判）
    const asManager = await this.managerService.findProfileByAccountId(currentAccountId);
    if (asManager) {
      if (!params.customerId) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 必须指定目标客户 ID');
      }

      const target = await this.customerService.findProfileById(params.customerId);
      if (!target) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标客户不存在');
      }

      return { targetCustomerId: params.customerId, isManager: true };
    }

    // 其次判定是否为 customer（仅允许编辑自身客户记录）
    const asCustomer = await this.customerService.findProfileByAccountId(currentAccountId);
    if (asCustomer) {
      if (params.customerId && params.customerId !== asCustomer.id) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限编辑其他客户信息');
      }
      return { targetCustomerId: asCustomer.id, isManager: false };
    }

    // 两种身份均不匹配
    throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');
  }

  /**
   * 准备更新数据（根据身份控制可更新字段）
   * @param params 用例参数
   * @returns 部分更新数据
   */
  private prepareUpdateData(params: UpdateCustomerUsecaseParams): CustomerUpdatePatch {
    return normalizeUpdateCustomerInput({
      name: params.name,
      contactPhone: params.contactPhone,
      preferredContactTime: params.preferredContactTime,
      remark: params.remark,
    });
  }

  /**
   * 幂等检查：判断是否存在字段变更
   * @param updateData 准备更新的数据
   * @param current 当前实体
   * @returns 是否有变更
   */
  private hasDataChanges(updateData: CustomerUpdatePatch, current: CustomerView): boolean {
    const fields: ReadonlyArray<'name' | 'contactPhone' | 'preferredContactTime' | 'remark'> = [
      'name',
      'contactPhone',
      'preferredContactTime',
      'remark',
    ];
    return fields.some((field) => {
      if (typeof updateData[field] === 'undefined') return false;
      return updateData[field] !== current[field];
    });
  }
}
