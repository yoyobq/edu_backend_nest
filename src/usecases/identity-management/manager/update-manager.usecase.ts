// src/usecases/identity-management/manager/update-manager.usecase.ts
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { ManagerEntity } from '@modules/account/identities/training/manager/account-manager.entity';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行更新 Manager 信息
   */
  async execute(params: UpdateManagerUsecaseParams): Promise<ManagerEntity> {
    const { currentAccountId } = params;

    const ctx = await this.resolveIdentityContext(currentAccountId, params);

    return await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ManagerEntity);
      const entity = await repo.findOne({ where: { id: ctx.targetManagerId } });
      if (!entity) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, 'Manager 不存在');
      }

      const updateData = this.prepareUpdateData({ ...params });
      if (!this.hasDataChanges(updateData, entity)) {
        return entity;
      }

      updateData.updatedBy = currentAccountId;
      updateData.updatedAt = new Date();
      await repo.update(entity.id, updateData);

      const updated = await repo.findOne({ where: { id: entity.id } });
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
    const me = await this.managerService.findByAccountId(currentAccountId);
    if (!me) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可编辑资料');
    }

    if (!params.managerId) {
      return { targetManagerId: me.id };
    }

    // 允许编辑其他 manager 的资料（系统规则）
    const target = await this.managerService.findById(params.managerId);
    if (!target) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标 Manager 不存在');
    }
    return { targetManagerId: params.managerId };
  }

  /** 准备更新数据 */
  private prepareUpdateData(params: UpdateManagerUsecaseParams): Partial<ManagerEntity> {
    const updateData: Partial<ManagerEntity> = {};
    this.applyName(updateData, params.name);
    this.applyRemark(updateData, params.remark);
    return updateData;
  }

  /** 幂等检查 */
  private hasDataChanges(updateData: Partial<ManagerEntity>, current: ManagerEntity): boolean {
    const keys = Object.keys(updateData) as (keyof ManagerEntity)[];
    if (keys.length === 0) return false;
    return keys.some((key) => updateData[key] !== current[key]);
  }

  /** 处理 name */
  private applyName(updateData: Partial<ManagerEntity>, name: string | undefined): void {
    if (typeof name === 'undefined') return;
    const val = (name ?? '').trim();
    if (val.length > 64) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '姓名长度不能超过 64');
    }
    updateData.name = val;
  }

  /** 处理 remark */
  private applyRemark(updateData: Partial<ManagerEntity>, remark: string | null | undefined): void {
    if (typeof remark === 'undefined') return;
    const val = remark ?? null;
    if (val && val.length > 255) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '备注长度不能超过 255');
    }
    updateData.remark = val;
  }
}
