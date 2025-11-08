// src/usecases/identity-management/coach/reactivate-coach.usecase.ts
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { CoachEntity } from '@modules/account/identities/training/coach/account-coach.entity';
import { CoachService } from '@modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 上线教练输入参数
 */
export interface ReactivateCoachParams {
  /** 教练 ID */
  id: number;
}

/**
 * 上线教练输出结果
 */
export interface ReactivateCoachResult {
  /** 更新后的教练实体 */
  coach: CoachEntity;
  /** 是否发生状态变更（幂等为 false） */
  isUpdated: boolean;
}

/**
 * 上线教练用例
 * 规则：仅 manager 可以执行；幂等支持：若已上线则直接返回。
 */
@Injectable()
export class ReactivateCoachUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly coachService: CoachService,
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
    input: ReactivateCoachParams,
  ): Promise<ReactivateCoachResult> {
    // 权限：仅 manager 身份
    const manager = await this.managerService.findByAccountId(currentAccountId);
    if (!manager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅 manager 可以上线教练');
    }

    // 查找教练
    const entity = await this.coachService.findById(input.id);
    if (!entity) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '教练不存在');
    }

    // 幂等：已上线直接返回
    if (!entity.deactivatedAt) {
      return { coach: entity, isUpdated: false };
    }

    const now = new Date();

    // 单事务更新，写入审计字段
    await this.dataSource.transaction(async (managerTx) => {
      await managerTx.getRepository(CoachEntity).update(entity.id, {
        deactivatedAt: null,
        updatedBy: currentAccountId,
        updatedAt: now,
      });
    });

    const updated = await this.coachService.findById(entity.id);
    if (!updated) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '上线教练失败');
    }
    return { coach: updated, isUpdated: true };
  }
}
