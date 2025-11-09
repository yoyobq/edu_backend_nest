// src/usecases/course/payout/get-payout-rule.usecase.ts
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';

/**
 * 获取结算规则用例
 *
 * 根据规则 ID 或系列 ID 返回规则。系列 ID 查询仅适用于课程绑定规则。
 */
@Injectable()
export class GetPayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 按 ID 获取
   * @param args 查询参数对象
   */
  async byId(args: { readonly id: number }): Promise<PayoutSeriesRuleEntity> {
    const found = await this.ruleService.findById(args.id);
    if (!found) {
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
    }
    return found;
  }

  /**
   * 按系列 ID 获取（仅课程绑定规则）
   * @param args 查询参数对象
   */
  async bySeries(args: { readonly seriesId: number }): Promise<PayoutSeriesRuleEntity> {
    const found = await this.ruleService.findBySeriesId(args.seriesId);
    if (!found) {
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '该课程系列未绑定结算规则');
    }
    return found;
  }
}
