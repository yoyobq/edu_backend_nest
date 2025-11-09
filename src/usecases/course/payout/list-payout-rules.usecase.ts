// src/usecases/course/payout/list-payout-rules.usecase.ts
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import type { SearchParams, SearchResult } from '@core/search/search.types';
import type { CursorToken } from '@core/pagination/pagination.types';

/**
 * 列出结算规则/模板用例（纯读）
 *
 * 支持按 isTemplate / isActive / seriesId 过滤。
 */
@Injectable()
export class ListPayoutRulesUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 执行列表查询
   * @param args 过滤参数对象
   * @returns 规则列表
   */
  async execute(args?: {
    readonly isTemplate?: number;
    readonly isActive?: number;
    readonly seriesId?: number | null;
  }): Promise<PayoutSeriesRuleEntity[]> {
    return await this.ruleService.findAll(args);
  }

  /**
   * 搜索 + 分页（纯读）
   * - 接入通用搜索与分页管线
   * - 排除 JSON 细项过滤，仅文本搜索 description 与基础过滤/排序
   * @param input 搜索参数（含分页）与可选游标令牌
   */
  async searchPaged(input: {
    readonly params: SearchParams;
    readonly cursorToken?: CursorToken;
  }): Promise<SearchResult<PayoutSeriesRuleEntity>> {
    return this.ruleService.searchPaged({ params: input.params, cursorToken: input.cursorToken });
  }
}
