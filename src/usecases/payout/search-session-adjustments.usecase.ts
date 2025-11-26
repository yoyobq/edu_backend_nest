// 文件位置：src/usecases/payout/search-session-adjustments.usecase.ts
import { DomainError, PAGINATION_ERROR, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import type { CursorToken } from '@core/pagination/pagination.types';
import type { SearchParams, SearchResult } from '@core/search/search.types';
import { Inject, Injectable } from '@nestjs/common';
import { CustomerService } from '@src/modules/account/identities/training/customer/account-customer.service';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import {
  PayoutSessionAdjustmentEntity,
  SessionAdjustmentReasonType,
} from '@src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '@src/modules/payout/session-adjustments/payout-session-adjustments.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export interface SearchSessionAdjustmentsInput {
  /** 会话上下文 */
  readonly session: UsecaseSession;
  /** 搜索与分页参数 */
  readonly params: SearchParams;
}

@Injectable()
export class SearchSessionAdjustmentsUsecase {
  constructor(
    private readonly adjustmentsService: PayoutSessionAdjustmentsService,
    private readonly managerService: ManagerService,
    private readonly customerService: CustomerService,
    @Inject(PAGINATION_TOKENS.CURSOR_SIGNER) private readonly cursorSigner: ICursorSigner,
  ) {}

  /**
   * 执行课次调整记录的分页查询（带权限校验与自我过滤）
   * - 允许 MANAGER / CUSTOMER 访问
   * - CUSTOMER 仅能查看与自己相关的记录（强制附加 customerId 过滤）
   */
  async execute(
    input: SearchSessionAdjustmentsInput,
  ): Promise<SearchResult<PayoutSessionAdjustmentEntity>> {
    const effective = await this.buildEffectiveParams(input);
    const token = this.parseCursorToken(effective.pagination);
    return await this.adjustmentsService.searchPaged({ params: effective, cursorToken: token });
  }

  /**
   * 组合有效的 SearchParams：完成权限判定与必要过滤的附加
   */
  private async buildEffectiveParams(input: SearchSessionAdjustmentsInput): Promise<SearchParams> {
    const { session, params } = input;
    const roles = (session.roles ?? []).map((r) => String(r).toUpperCase());
    const isManager = roles.includes('MANAGER') || roles.includes('ADMIN');
    const isCustomer = roles.includes('CUSTOMER');

    if (!isManager && !isCustomer) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 Manager 或 Customer 可查询课次调整记录',
      );
    }

    const sanitized = this.sanitizeFilters(params);

    if (isManager) {
      const active = await this.managerService.isActiveManager(session.accountId);
      if (!active) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可访问');
      return { query: params.query, filters: sanitized, pagination: params.pagination };
    }

    const meCustomer = await this.customerService.findByAccountId(session.accountId);
    if (!meCustomer) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户未绑定客户身份');
    }

    const mergedFilters: NonNullable<SearchParams['filters']> = {
      ...sanitized,
      customerId: meCustomer.id,
    };

    return {
      query: params.query,
      filters: mergedFilters,
      pagination: params.pagination,
    } satisfies SearchParams;
  }

  /**
   * 解析并验证游标字符串为 CursorToken
   */
  private parseCursorToken(p: SearchParams['pagination']): CursorToken | undefined {
    if (!p || p.mode !== 'CURSOR') return undefined;
    const after = (p as { after?: string }).after;
    const before = (p as { before?: string }).before;
    if (!after && !before) return undefined;
    const raw = before ?? after!;
    try {
      return this.cursorSigner.verify(raw);
    } catch {
      throw new DomainError(PAGINATION_ERROR.INVALID_CURSOR, '无效的游标字符串', { cursor: raw });
    }
  }

  /**
   * 过滤键清理与校验
   * - 仅允许 `customerId` / `operatorAccountId` 为正整数
   * - `reasonType` 必须为合法的枚举值
   */
  private sanitizeFilters(params: SearchParams): NonNullable<SearchParams['filters']> {
    const src = params.filters ?? {};
    const out: Record<string, string | number | boolean> = {};

    const cid = (src as { customerId?: unknown }).customerId;
    if (typeof cid === 'number' && Number.isInteger(cid) && cid > 0) out.customerId = cid;

    const opId = (src as { operatorAccountId?: unknown }).operatorAccountId;
    if (typeof opId === 'number' && Number.isInteger(opId) && opId > 0)
      out.operatorAccountId = opId;

    const r = (src as { reasonType?: unknown }).reasonType;
    if (typeof r === 'string') {
      const allowed = new Set<string>(Object.values(SessionAdjustmentReasonType));
      if (allowed.has(r)) out.reasonType = r;
    }

    const orderRef = (src as { orderRef?: unknown }).orderRef;
    if (typeof orderRef === 'string') {
      const trimmed = orderRef.trim();
      if (trimmed.length > 0 && trimmed.length <= 64) {
        out.orderRef = trimmed;
      }
    }

    return out;
  }
}
