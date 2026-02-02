// 文件位置：src/usecases/payout/create-session-adjustment.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import {
  DomainError,
  PAYOUT_SESSION_ADJUSTMENT_ERROR,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import {
  PayoutSessionAdjustmentEntity,
  SessionAdjustmentReasonType,
} from '@src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '@src/modules/payout/session-adjustments/payout-session-adjustments.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface CreateSessionAdjustmentInput {
  readonly session: UsecaseSession;
  readonly customerId: number;
  readonly deltaSessions: number;
  readonly beforeSessions: number;
  readonly afterSessions: number;
  readonly reasonType: string;
  readonly reasonNote?: string | null;
  readonly operatorAccountId?: number | null;
  readonly orderRef?: string | null;
}

/**
 * 创建课次调整记录用例
 */
@Injectable()
export class CreateSessionAdjustmentUsecase {
  constructor(
    private readonly adjustmentsService: PayoutSessionAdjustmentsService,
    private readonly customerService: CustomerService,
    private readonly managerService: ManagerService,
  ) {}

  /**
   * 执行创建课次调整记录
   * @param input 输入参数对象
   */
  async execute(input: CreateSessionAdjustmentInput): Promise<PayoutSessionAdjustmentEntity> {
    this.ensurePermissions(input.session);
    await this.ensureManagerActive(input.session);
    const normalized = this.normalizeInput(input);
    await this.assertCustomerExists(normalized.customerId);
    return await this.adjustmentsService.appendAdjustment({
      customerId: normalized.customerId,
      deltaSessions: normalized.deltaSessions,
      beforeSessions: normalized.beforeSessions,
      afterSessions: normalized.afterSessions,
      reasonType: normalized.reasonType,
      reasonNote: normalized.reasonNote,
      operatorAccountId: normalized.operatorAccountId,
      orderRef: normalized.orderRef,
    });
  }

  /**
   * 校验权限：仅允许 admin / manager
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    if (!isAdmin && !isManager) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权创建课次调整记录');
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
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可创建课次调整记录');
    }
  }

  /**
   * 规范化与校验输入参数
   * @param input 输入参数对象
   */
  private normalizeInput(input: CreateSessionAdjustmentInput): {
    customerId: number;
    deltaSessions: number;
    beforeSessions: number;
    afterSessions: number;
    reasonType: SessionAdjustmentReasonType;
    reasonNote: string | null;
    operatorAccountId: number | null;
    orderRef: string | null;
  } {
    if (!Number.isInteger(input.customerId) || input.customerId <= 0) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'customerId 无效');
    }
    if (!Number.isFinite(input.deltaSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'deltaSessions 无效');
    }
    if (!Number.isFinite(input.beforeSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'beforeSessions 无效');
    }
    if (!Number.isFinite(input.afterSessions)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'afterSessions 无效');
    }

    const allowed = new Set<string>(Object.values(SessionAdjustmentReasonType));
    if (!allowed.has(input.reasonType)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'reasonType 无效');
    }
    const reasonType = input.reasonType as SessionAdjustmentReasonType;

    const reasonNote = this.normalizeNullableText(input.reasonNote, 255, 'reasonNote');
    const orderRef = this.normalizeNullableText(input.orderRef, 64, 'orderRef');
    const operatorAccountId =
      input.operatorAccountId !== undefined ? input.operatorAccountId : input.session.accountId;

    return {
      customerId: input.customerId,
      deltaSessions: input.deltaSessions,
      beforeSessions: input.beforeSessions,
      afterSessions: input.afterSessions,
      reasonType,
      reasonNote,
      operatorAccountId: operatorAccountId ?? null,
      orderRef,
    };
  }

  /**
   * 校验客户是否存在
   * @param customerId 客户 ID
   */
  private async assertCustomerExists(customerId: number): Promise<void> {
    const customer = await this.customerService.findById(customerId);
    if (!customer) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.CUSTOMER_NOT_FOUND, '客户不存在', {
        customerId,
      });
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
  ): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLen) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, `${field} 长度超限`);
    }
    return trimmed;
  }
}
