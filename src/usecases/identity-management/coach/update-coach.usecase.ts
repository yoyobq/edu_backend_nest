// src/usecases/identity-management/coach/update-coach.usecase.ts
import { ACCOUNT_ERROR, DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import {
  CoachService,
  type CoachProfile,
} from '@modules/account/identities/training/coach/coach.service';
import { ManagerService } from '@modules/account/identities/training/manager/manager.service';
import { Injectable } from '@nestjs/common';
import { normalizeUpdateCoachInput } from './coach.input.normalize';

export type CoachView = CoachProfile;

/**
 * 更新教练信息用例的输入参数
 */
export interface UpdateCoachUsecaseParams {
  /** 当前用户账户 ID */
  currentAccountId: number;
  /** 目标教练 ID（可选，manager 身份时必须指定） */
  coachId?: number;
  /** 教练姓名（可选） */
  name?: string;
  /** 教练等级（可选，仅 manager 可修改） */
  level?: number;
  /** 简介/推介（可选） */
  description?: string | null;
  /** 头像 URL（可选） */
  avatarUrl?: string | null;
  /** 教练专长（可选） */
  specialty?: string | null;
  /** 备注（可选） */
  remark?: string | null;
}

type CoachUpdatePatch = {
  name?: string;
  level?: number;
  description?: string | null;
  avatarUrl?: string | null;
  specialty?: string | null;
  remark?: string | null;
  updatedBy?: number | null;
  updatedAt?: Date;
};

/**
 * 更新教练信息用例
 *
 * 规则：
 * - coach 身份：仅允许更新 name/description/avatarUrl/specialty/remark，不可更新 level；仅能操作自己的教练记录。
 * - manager 身份：必须指定 coachId，可更新上述字段以及 level。
 * - 幂等：无数据变更时直接返回当前实体。
 * - 事务：所有更新在单事务内完成，统一写入审计字段。
 */
@Injectable()
export class UpdateCoachUsecase {
  constructor(
    private readonly coachService: CoachService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行更新教练信息
   */
  async execute(params: UpdateCoachUsecaseParams): Promise<CoachView> {
    const { currentAccountId } = params;

    const ctx = await this.resolveIdentityContext(currentAccountId, params);

    return await this.coachService.runTransaction(async (manager) => {
      const current = await this.coachService.findProfileById(ctx.targetCoachId, manager);
      if (!current) {
        throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '教练不存在');
      }

      const updateData = this.prepareUpdateData({ ...params }, ctx);
      if (!this.hasDataChanges(updateData, current)) {
        return current;
      }

      updateData.updatedBy = currentAccountId;
      updateData.updatedAt = new Date();
      const updated = await this.coachService.updateCoachWithManager({
        id: ctx.targetCoachId,
        updateData,
        manager,
      });
      if (!updated) {
        throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '更新教练信息失败');
      }
      return updated;
    });
  }

  /**
   * 解析身份上下文
   */
  private async resolveIdentityContext(
    currentAccountId: number,
    params: UpdateCoachUsecaseParams,
  ): Promise<{ targetCoachId: number; isManager: boolean }> {
    // 尝试以 coach 身份解析
    const asCoach = await this.coachService.findProfileByAccountId(currentAccountId);
    if (asCoach) {
      if (params.coachId && params.coachId !== asCoach.id) {
        throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限编辑其他教练信息');
      }
      return { targetCoachId: asCoach.id, isManager: false };
    }

    // 验证 manager 身份
    const asManager = await this.managerService.findByAccountId(currentAccountId);
    if (!asManager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '用户身份验证失败');
    }
    if (!params.coachId) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Manager 必须指定目标教练 ID');
    }
    const target = await this.coachService.findProfileById(params.coachId);
    if (!target) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '目标教练不存在');
    }
    return { targetCoachId: params.coachId, isManager: true };
  }

  /**
   * 准备更新数据（根据身份控制可更新字段）
   */
  private prepareUpdateData(
    params: UpdateCoachUsecaseParams,
    ctx: { isManager: boolean; targetCoachId: number },
  ): CoachUpdatePatch {
    const updateData: CoachUpdatePatch = normalizeUpdateCoachInput({
      name: params.name,
      description: params.description,
      avatarUrl: params.avatarUrl,
      specialty: params.specialty,
      remark: params.remark,
    });
    this.applyLevel(updateData, ctx.isManager, params.level);

    return updateData;
  }

  /** 幂等检查 */
  private hasDataChanges(updateData: CoachUpdatePatch, current: CoachView): boolean {
    const fields: ReadonlyArray<
      'name' | 'level' | 'description' | 'avatarUrl' | 'specialty' | 'remark'
    > = ['name', 'level', 'description', 'avatarUrl', 'specialty', 'remark'];
    return fields.some((field) => {
      if (typeof updateData[field] === 'undefined') return false;
      return updateData[field] !== current[field];
    });
  }

  /** 处理 level（仅 manager 可更新） */
  private applyLevel(updateData: CoachUpdatePatch, isManager: boolean, level?: number): void {
    if (typeof level === 'undefined') return;
    if (!isManager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, 'Coach 不可修改等级');
    }
    const val = level ?? 1;
    if (val < 1 || val > 3) {
      throw new DomainError(ACCOUNT_ERROR.OPERATION_NOT_SUPPORTED, '等级必须在 1-3 之间');
    }
    updateData.level = val;
  }
}
