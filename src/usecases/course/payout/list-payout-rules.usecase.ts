// src/usecases/course/payout/list-payout-rules.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import type { SearchParams, SearchResult } from '@core/search/search.types';
import type { CursorToken } from '@core/pagination/pagination.types';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import { DomainError, PAGINATION_ERROR } from '@core/common/errors/domain-error';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';

/**
 * 列出结算规则/模板用例（纯读）
 *
 * 支持按 isTemplate / isActive / seriesId 过滤。
 */
@Injectable()
export class ListPayoutRulesUsecase {
  constructor(
    private readonly ruleService: PayoutSeriesRuleService,
    // 注入游标签名器用于 CURSOR 模式的游标校验
    @Inject(PAGINATION_TOKENS.CURSOR_SIGNER) private readonly cursorSigner: ICursorSigner,
  ) {}

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
  /**
   * 搜索 + 分页（纯读）
   * - 统一在用例层校验 CURSOR 游标字符串，失败抛出 PAGINATION_INVALID_CURSOR
   * - 其余搜索/排序逻辑由服务层与基础设施搜索引擎承载
   */
  async searchPaged(input: {
    readonly params: SearchParams;
    readonly cursorToken?: CursorToken; // 兼容旧签名；忽略，改为从 params.pagination 提取
  }): Promise<SearchResult<PayoutSeriesRuleEntity>> {
    const p = input.params.pagination as {
      mode: 'OFFSET' | 'CURSOR';
      after?: string;
      before?: string;
    };
    let token: CursorToken | undefined = undefined;
    if (p.mode === 'CURSOR' && (p.after || p.before)) {
      const raw = p.before ?? p.after!;
      try {
        token = this.cursorSigner.verify(raw);
      } catch {
        throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '无效的游标字符串', { cursor: raw });
      }
    }
    return this.ruleService.searchPaged({ params: input.params, cursorToken: token });
  }
}
