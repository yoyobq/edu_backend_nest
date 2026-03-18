// src/usecases/identity-management/manager/update-manager.usecase.ts
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import {
  ManagerService,
  type ManagerProfile,
} from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { normalizeUpdateManagerInput } from './manager.input.normalize';

export type ManagerView = ManagerProfile;

type ManagerUpdatePatch = {
  name?: string;
  remark?: string | null;
  updatedBy?: number | null;
  updatedAt?: Date;
};

/**
 * 更新 Manager 信息用例的输入参数
 */
export interface UpdateManagerUsecaseParams {
  /** 当前用户账户 ID */
  currentAccountId: number;
  /** 目标 Manager ID（可选，manager 身份时必须指定） */
  managerId?: number;
  /** 姓名 */
  name?: string;
  /** 备注，不对外 */
  remark?: string | null;
}

/**
 * 更新 Manager 信息用例
 *
 * 规则：
 * - manager 身份可以互相编辑资料（允许编辑其他 manager 的 name/remark），但不得下线对方。
 * - 幂等：无数据变更时直接返回当前实体。
 * - 事务：所有更新在单事务内完成，统一写入审计字段。
 */
@Injectable()
export class UpdateManagerUsecase {
  constructor(private readonly managerService: ManagerService) {}

  /**
   * 执行更新 Manager 信息
   */
  async execute(params: UpdateManagerUsecaseParams): Promise<ManagerView> {
    const { currentAccountId } = params;

    const ctx = await this.resolveIdentityContext(currentAccountId, params);

    return await this.managerService.runTransaction(async (manager) => {
      const current = await this.managerService.findProfileById(ctx.targetManagerId, manager);
      if (!current) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, 'Manager 不存在');
      }

      const updateData = this.prepareUpdateData({ ...params });
      if (!this.hasDataChanges(updateData, current)) {
        return current;
      }

      updateData.updatedBy = currentAccountId;
      updateData.updatedAt = new Date();
      const updated = await this.managerService.updateManagerWithManager({
        id: ctx.targetManagerId,
        updateData,
        manager,
      });
      if (!updated) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '更新 Manager 信息失败');
      }
      return updated;
    });
  }

  /**
   * 解析身份上下文
   * - 当前系统允许 manager 互相修改资料
   * - 若当前用户不是 manager，则拒绝
   * - 若未指定 managerId，则默认编辑自己的记录
   */
  private async resolveIdentityContext(
    currentAccountId: number,
    params: UpdateManagerUsecaseParams,
  ): Promise<{ targetManagerId: number }> {
    const me = await this.managerService.findProfileByAccountId(currentAccountId);
    if (!me) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可编辑资料');
    }

    if (!params.managerId) {
      return { targetManagerId: me.id };
    }

    // 允许编辑其他 manager 的资料（系统规则）
    const target = await this.managerService.findProfileById(params.managerId);
    if (!target) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标 Manager 不存在');
    }
    return { targetManagerId: params.managerId };
  }

  /** 准备更新数据 */
  private prepareUpdateData(params: UpdateManagerUsecaseParams): ManagerUpdatePatch {
    return normalizeUpdateManagerInput({
      name: params.name,
      remark: params.remark,
    });
  }

  /** 幂等检查 */
  private hasDataChanges(updateData: ManagerUpdatePatch, current: ManagerView): boolean {
    const fields: ReadonlyArray<'name' | 'remark'> = ['name', 'remark'];
    return fields.some((field) => {
      if (typeof updateData[field] === 'undefined') return false;
      return updateData[field] !== current[field];
    });
  }
}
