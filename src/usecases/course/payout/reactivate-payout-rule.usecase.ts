// src/usecases/course/payout/reactivate-payout-rule.usecase.ts
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 重新激活（启用）结算规则用例
 */
@Injectable()
export class ReactivatePayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 执行重新激活（启用）
   * @param args 参数对象
   */
  async execute(args: { readonly id: number; readonly session: UsecaseSession }): Promise<{
    rule: PayoutSeriesRuleEntity;
    isUpdated: boolean; // 幂等标记：若已启用则为 false
  }> {
    try {
      const found = await this.ruleService.findById(args.id);
      if (!found) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
      const updated = await this.ruleService.activateById(args.id, args.session.accountId);
      if (!updated) {
        throw new DomainError(PAYOUT_RULE_ERROR.ACTIVATE_FAILED, '重新激活结算规则失败');
      }
      return { rule: updated, isUpdated: found.isActive === 0 };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(PAYOUT_RULE_ERROR.ACTIVATE_FAILED, '重新激活结算规则失败', { error });
    }
  }
}
