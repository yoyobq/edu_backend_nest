// src/usecases/course/payout/delete-payout-rule.usecase.ts
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 删除结算规则用例
 *
 * 负责根据 ID 删除规则，返回是否删除成功。
 */
@Injectable()
export class DeletePayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 执行删除规则
   * @param args 删除参数对象
   * @returns 是否删除成功
   */
  async execute(args: { readonly id: number; readonly session: UsecaseSession }): Promise<boolean> {
    try {
      const found = await this.ruleService.findById(args.id);
      if (!found) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
      const ok = await this.ruleService.deleteById(args.id);
      if (!ok) {
        throw new DomainError(PAYOUT_RULE_ERROR.RULE_DELETE_FAILED, '删除结算规则失败');
      }
      return true;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_DELETE_FAILED, '删除结算规则失败', { error });
    }
  }
}
