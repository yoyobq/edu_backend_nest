// 文件位置：src/usecases/payout/update-session-adjustment.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  DomainError,
  PAYOUT_SESSION_ADJUSTMENT_ERROR,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import {
  PayoutSessionAdjustmentEntity,
  SessionAdjustmentReasonType,
} from '@src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '@src/modules/payout/session-adjustments/payout-session-adjustments.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface UpdateSessionAdjustmentInput {
  readonly session: UsecaseSession;
  readonly id: number;
  readonly deltaSessions?: number;
  readonly beforeSessions?: number;
  readonly afterSessions?: number;
  readonly reasonType?: string;
  readonly reasonNote?: string | null;
  readonly orderRef?: string | null;
}

/**
 * 更新课次调整记录用例
 */
@Injectable()
export class UpdateSessionAdjustmentUsecase {
  constructor(
    private readonly adjustmentsService: PayoutSessionAdjustmentsService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行更新课次调整记录
   * @param input 输入参数对象
   */
  async execute(input: UpdateSessionAdjustmentInput): Promise<PayoutSessionAdjustmentEntity> {
    this.ensurePermissions(input.session);
    await this.ensureManagerActive(input.session);
    const normalized = this.normalizeInput(input);
    const existing = await this.adjustmentsService.findById(normalized.id);
    if (!existing) {
      throw new DomainError(
        PAYOUT_SESSION_ADJUSTMENT_ERROR.ADJUSTMENT_NOT_FOUND,
        '课次调整记录不存在',
        { id: normalized.id },
      );
    }
    return await this.adjustmentsService.updateAdjustment(normalized);
  }

  /**
   * 校验权限：仅允许 admin / manager
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    if (!isAdmin && !isManager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权更新课次调整记录');
    }
  }

  /**
   * 校验 manager 是否为可用状态
   * @param session 用例会话
   */
  private async ensureManagerActive(session: UsecaseSession): Promise<void> {
    const isManager = (session.roles ?? []).includes(IdentityTypeEnum.MANAGER);
    if (!isManager) return;
    const active = await this.managerService.isActiveManager(session.accountId);
    if (!active) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可更新课次调整记录');
    }
  }

  /**
   * 规范化与校验输入参数
   * @param input 输入参数对象
   */
  private normalizeInput(input: UpdateSessionAdjustmentInput): {
    id: number;
    deltaSessions?: number;
    beforeSessions?: number;
    afterSessions?: number;
    reasonType?: SessionAdjustmentReasonType;
    reasonNote?: string | null;
    operatorAccountId: number;
    orderRef?: string | null;
  } {
    this.validateId(input.id);
    this.validateUpdatePresence(input);
    this.validateNumericFields(input);
    this.validateReasonType(input.reasonType);
    const reasonType =
      input.reasonType === undefined
        ? undefined
        : (input.reasonType as SessionAdjustmentReasonType);
    return {
      id: input.id,
      deltaSessions: input.deltaSessions,
      beforeSessions: input.beforeSessions,
      afterSessions: input.afterSessions,
      reasonType,
      reasonNote: this.normalizeNullableText(input.reasonNote, 255, 'reasonNote'),
      operatorAccountId: input.session.accountId,
      orderRef: this.normalizeNullableText(input.orderRef, 64, 'orderRef'),
    };
  }

  /**
   * 校验记录 ID 合法性
   * @param id 记录 ID
   */
  private validateId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'id 无效');
    }
  }

  /**
   * 校验是否包含可更新字段
   * @param input 输入参数对象
   */
  private validateUpdatePresence(input: UpdateSessionAdjustmentInput): void {
    const hasUpdate =
      input.deltaSessions !== undefined ||
      input.beforeSessions !== undefined ||
      input.afterSessions !== undefined ||
      input.reasonType !== undefined ||
      input.reasonNote !== undefined ||
      input.orderRef !== undefined;
    if (!hasUpdate) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, '未提供可更新字段');
    }
  }

  /**
   * 校验数字字段合法性
   * @param input 输入参数对象
   */
  private validateNumericFields(input: UpdateSessionAdjustmentInput): void {
    if (input.deltaSessions !== undefined && !Number.isFinite(input.deltaSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'deltaSessions 无效');
    }
    if (input.beforeSessions !== undefined && !Number.isFinite(input.beforeSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'beforeSessions 无效');
    }
    if (input.afterSessions !== undefined && !Number.isFinite(input.afterSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'afterSessions 无效');
    }
  }

  /**
   * 校验 reasonType 合法性
   * @param reasonType 调整原因类型
   */
  private validateReasonType(reasonType?: string): void {
    if (reasonType === undefined) return;
    const allowed = new Set<string>(Object.values(SessionAdjustmentReasonType));
    if (!allowed.has(reasonType)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'reasonType 无效');
    }
  }

  /**
   * 处理可空文本并做长度校验
   * @param value 输入文本
   * @param maxLen 最大长度
   * @param field 字段名
   */
  private normalizeNullableText(
    value: string | null | undefined,
    maxLen: number,
    field: string,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value == null) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLen) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, `${field} 长度超限`);
    }
    return trimmed;
  }
}
