// src/usecases/course/payout/list-payout-rules.usecase.ts
import { PublisherType } from '@app-types/models/course-series.types';
import { DomainError, PAGINATION_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import type { CursorToken } from '@core/pagination/pagination.types';
import type { SearchParams, SearchResult } from '@core/search/search.types';
import { Inject, Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { CourseSeriesService } from '@src/modules/course/series/course-series.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

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
    private readonly seriesService: CourseSeriesService,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 判断当前会话是否包含 coach 角色
   * @param session 会话对象
   * @returns 是否为 coach 角色
   */
  private isCoach(session?: UsecaseSession): boolean {
    return session?.roles?.some((r) => String(r).toUpperCase() === 'COACH') ?? false;
  }

  /**
   * 校验指定系列归属当前 coach（仅在提供 seriesId 且为 coach 角色时调用）
   * @param seriesId 系列 ID
   * @param session 会话对象（需要包含 accountId 与角色信息）
   */
  private async assertCoachOwnership(seriesId: number, session: UsecaseSession): Promise<void> {
    const series = await this.seriesService.findById(seriesId);
    if (!series) {
      // 为避免资源探测，不暴露是否存在，直接返回权限错误
      throw new DomainError(
        PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
        '仅允许查看自身课程系列的结算规则',
      );
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '当前账户未绑定教练身份，无法查看系列结算规则',
      );
    }
    const ownedByCoach =
      series.publisherType === PublisherType.COACH && series.publisherId === coach.id;
    if (!ownedByCoach) {
      throw new DomainError(
        PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
        '仅允许查看自身课程系列的结算规则',
      );
    }
  }

  /**
   * 执行列表查询
   * @param args 过滤参数对象
   * @returns 规则列表
   */
  /**
   * 执行列表查询
   * - 若为 coach 角色且提供了系列筛选，需校验该系列归属当前教练
   * - 无系列筛选时不做归属限制（保留现有行为），便于查看模板
   * @param args 过滤参数对象（含可选会话）
   * @returns 规则列表
   */
  async execute(args?: {
    readonly isTemplate?: number;
    readonly isActive?: number;
    readonly seriesId?: number | null;
    readonly session?: UsecaseSession;
  }): Promise<PayoutSeriesRuleEntity[]> {
    // 当提供 seriesId 且当前角色为 coach 时，校验系列归属
    if (typeof args?.seriesId === 'number' && this.isCoach(args?.session)) {
      await this.assertCoachOwnership(args.seriesId, args.session!);
    }

    return await this.ruleService.findAll({
      isTemplate: args?.isTemplate,
      isActive: args?.isActive,
      seriesId: args?.seriesId ?? undefined,
    });
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
