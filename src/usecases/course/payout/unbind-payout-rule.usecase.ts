// src/usecases/course/payout/unbind-payout-rule.usecase.ts
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 解绑结算规则与课程系列用例
 *
 * 将课程绑定的规则解除为模板。
 */
@Injectable()
export class UnbindPayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 执行解绑
   * @param args 参数对象
   */
  async execute(args: {
    readonly ruleId: number;
    readonly session: UsecaseSession;
  }): Promise<PayoutSeriesRuleEntity> {
    const rule = await this.ruleService.findById(args.ruleId);
    if (!rule) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
    if (rule.seriesId == null) {
      throw new DomainError(PAYOUT_RULE_ERROR.INVALID_PARAMS, '该规则不是课程绑定规则，无法解绑');
    }
    const updated = await this.ruleService.unbindFromSeries(args.ruleId, args.session.accountId);
    if (!updated) throw new DomainError(PAYOUT_RULE_ERROR.UNBIND_FAILED, '解绑结算规则失败');
    return updated;
  }
}
