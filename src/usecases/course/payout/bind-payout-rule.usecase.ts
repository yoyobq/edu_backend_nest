// src/usecases/course/payout/bind-payout-rule.usecase.ts
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 绑定结算规则到开课班用例
 *
 * 将模板规则绑定到指定开课班，若该系列已有规则则失败。
 */
@Injectable()
export class BindPayoutRuleUsecase {
  constructor(
    private readonly ruleService: PayoutSeriesRuleService,
    private readonly seriesService: CourseSeriesService,
  ) {}

  /**
   * 执行绑定
   * @param args 参数对象
   */
  async execute(args: {
    readonly ruleId: number; // 模板规则 ID
    readonly seriesId: number; // 开课班 ID
    readonly session: UsecaseSession;
  }): Promise<{ rule: PayoutSeriesRuleEntity; isUpdated: boolean }> {
    // 先确认 series 存在
    const series = await this.seriesService.findById(args.seriesId);
    if (!series) {
      throw new DomainError(PAYOUT_RULE_ERROR.INVALID_PARAMS, '开课班不存在', {
        seriesId: args.seriesId,
      });
    }

    // 再确认 rule 存在
    const rule = await this.ruleService.findById(args.ruleId);
    if (!rule) throw new DomainError(PAYOUT_RULE_ERROR.RULE_NOT_FOUND, '结算规则不存在');

    // 不允许绑定已停用规则
    if (rule.isActive === 0) {
      throw new DomainError(PAYOUT_RULE_ERROR.INACTIVE_BIND, '无法绑定已停用的结算规则', {
        ruleId: args.ruleId,
      });
    }

    // 互斥语义：绑定后需 isTemplate=0；若当前已是课程绑定规则但 series 不同，需走冲突逻辑
    const isCurrentlyTemplate = rule.seriesId == null && rule.isTemplate === 1;

    // 尝试绑定（服务层对冲突返回 null）
    const updated = await this.ruleService.bindToSeries(
      args.ruleId,
      args.seriesId,
      args.session.accountId,
    );
    if (!updated) {
      throw new DomainError(
        PAYOUT_RULE_ERROR.SERIES_RULE_CONFLICT,
        '该开课班已绑定其他结算规则，无法重复绑定',
        { seriesId: args.seriesId },
      );
    }
    return { rule: updated, isUpdated: isCurrentlyTemplate };
  }
}
