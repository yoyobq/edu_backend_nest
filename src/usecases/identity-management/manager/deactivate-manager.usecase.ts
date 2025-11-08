// src/usecases/identity-management/manager/deactivate-manager.usecase.ts
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { ManagerEntity } from '@modules/account/identities/training/manager/account-manager.entity';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** 下线 Manager 用例入参 */
export interface DeactivateManagerParams {
  /** 目标 Manager ID */
  id: number;
}

/** 下线 Manager 用例结果 */
export interface DeactivateManagerResult {
  /** Manager 实体 */
  manager: ManagerEntity;
  /** 是否发生状态变更（幂等为 false） */
  isUpdated: boolean;
}

/**
 * 下线 Manager 用例
 *
 * 规则：
 * - 仅允许 manager 身份执行；但系统约束为“不能随意下线别人”，因此仅允许下线自身。
 * - 幂等：重复下线不会抛错，返回 isUpdated=false。
 * - 单事务：更新下线状态与审计字段。
 */
@Injectable()
export class DeactivateManagerUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly managerService: ManagerService,
  ) {}

  /** 执行下线操作 */
  async execute(
    currentAccountId: number,
    input: DeactivateManagerParams,
  ): Promise<DeactivateManagerResult> {
    const me = await this.managerService.findByAccountId(currentAccountId);
    if (!me) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可以下线');
    }

    // 只允许下线自己
    if (input.id !== me.id) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '不能随意下线其他 manager');
    }

    const entity = await this.managerService.findById(input.id);
    if (!entity) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, 'Manager 不存在');
    }

    // 幂等：已下线直接返回
    if (entity.deactivatedAt) {
      return { manager: entity, isUpdated: false };
    }

    const now = new Date();

    await this.dataSource.transaction(async (tx) => {
      await tx.getRepository(ManagerEntity).update(entity.id, {
        deactivatedAt: now,
        updatedBy: currentAccountId,
        updatedAt: now,
      });
    });

    const updated = await this.managerService.findById(entity.id);
    if (!updated) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '下线 Manager 失败');
    }
    return { manager: updated, isUpdated: true };
  }
}
