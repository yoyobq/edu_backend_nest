// src/usecases/course/payout/update-payout-rule.usecase.ts
import { type PayoutRuleJson } from '@app-types/models/payout-series-rule.types';
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 更新结算规则用例
 *
 * 支持元信息更新（描述、启停、模板标记）以及规则 JSON 更新两种操作。
 */
@Injectable()
export class UpdatePayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 更新元信息（不改 JSON）
   * @param args 更新参数对象
   */
  async updateMeta(args: {
    readonly id: number;
    readonly patch: Partial<
      Pick<PayoutSeriesRuleEntity, 'description' | 'isActive' | 'isTemplate'>
    >;
    readonly session: UsecaseSession;
  }): Promise<PayoutSeriesRuleEntity> {
    try {
      const found = await this.ruleService.findById(args.id);
      if (!found) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
      const updated = await this.ruleService.updateMeta(args.id, {
        ...args.patch,
        updatedBy: args.session.accountId,
      });
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_UPDATE_FAILED, '更新结算规则失败', { error });
    }
  }

  /**
   * 更新 JSON 规则
   * @param args 更新参数对象
   */
  async updateJson(args: {
    readonly id: number;
    readonly ruleJson: PayoutRuleJson;
    readonly session: UsecaseSession;
  }): Promise<PayoutSeriesRuleEntity> {
    // 基础校验：base 需要为非负，factors 键值为有限数字
    if (args.ruleJson.base < 0) {
      throw new DomainError(PAYOUT_RULE_ERROR.INVALID_PARAMS, 'rule_json.base 不能为负数', {
        base: args.ruleJson.base,
      });
    }
    for (const [k, v] of Object.entries(args.ruleJson.factors)) {
      if (typeof v !== 'number' || Number.isNaN(v)) {
        throw new DomainError(
          PAYOUT_RULE_ERROR.INVALID_PARAMS,
          'rule_json.factors 的值必须为有效数字',
          { key: k, value: v },
        );
      }
    }

    try {
      const found = await this.ruleService.findById(args.id);
      if (!found) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');
      const updated = await this.ruleService.updateRuleJson(args.id, args.ruleJson);
      // 记录更新者
      await this.ruleService.updateMeta(args.id, { updatedBy: args.session.accountId });
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_UPDATE_FAILED, '更新结算规则失败', { error });
    }
  }
}
