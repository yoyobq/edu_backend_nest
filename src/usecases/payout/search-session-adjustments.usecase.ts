// 文件位置：src/usecases/payout/search-session-adjustments.usecase.ts
import {
  DomainError,
  PAGINATION_ERROR,
  PAYOUT_SESSION_ADJUSTMENT_ERROR,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { trimText } from '@core/common/text/text.helper';
import type { ICursorSigner } from '@core/pagination/pagination.ports';
import type { CursorToken } from '@core/pagination/pagination.types';
import type { SearchParams, SearchResult } from '@core/search/search.types';
import { Inject, Injectable } from '@nestjs/common';
import { ManagerService } from '@src/modules/account/identities/training/manager/manager.service';
import { PAGINATION_TOKENS } from '@src/modules/common/tokens/pagination.tokens';
import {
  PayoutSessionAdjustmentEntity,
  SessionAdjustmentReasonType,
} from '@src/modules/payout/session-adjustments/payout-session-adjustment.entity';
import { PayoutSessionAdjustmentsService } from '@src/modules/payout/session-adjustments/payout-session-adjustments.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

type AdjustmentDirection = 'POSITIVE' | 'NEGATIVE';
const ADJUSTMENT_DIRECTIONS = new Set<AdjustmentDirection>(['POSITIVE', 'NEGATIVE']);

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
    @Inject(PAGINATION_TOKENS.CURSOR_SIGNER) private readonly cursorSigner: ICursorSigner,
  ) {}

  /**
   * 执行课次调整记录的分页查询（带权限校验与自我过滤）
   * - 仅允许 MANAGER / ADMIN 访问
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
    const isManager = roles.includes('MANAGER');
    const isAdmin = roles.includes('ADMIN');

    if (!isManager && !isAdmin) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 Manager 或 Admin 可查询课次调整记录',
      );
    }

    const sanitized = this.sanitizeFilters(params);

    if (isManager) {
      const active = await this.managerService.isActiveManager(session.accountId);
      if (!active) throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '仅活跃的 manager 可访问');
    }

    return { query: params.query, filters: sanitized, pagination: params.pagination };
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
    this.applyNumericFilters({ src, out });
    this.applyReasonTypeFilter({ src, out });
    this.applyOrderRefFilter({ src, out });
    this.applyCreatedRangeFilter({ src, out });
    this.applyDirectionFilter({ src, out });
    this.applyCustomerNameFilter({ src, out });
    return out;
  }

  /**
   * 追加数值类过滤
   * @param params 参数对象
   */
  private applyNumericFilters(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const cid = (params.src as { customerId?: unknown }).customerId;
    if (typeof cid === 'number' && Number.isInteger(cid) && cid > 0) params.out.customerId = cid;

    const opId = (params.src as { operatorAccountId?: unknown }).operatorAccountId;
    if (typeof opId === 'number' && Number.isInteger(opId) && opId > 0)
      params.out.operatorAccountId = opId;
  }

  /**
   * 追加原因类型过滤
   * @param params 参数对象
   */
  private applyReasonTypeFilter(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const r = (params.src as { reasonType?: unknown }).reasonType;
    if (typeof r !== 'string') return;
    const allowed = new Set<string>(Object.values(SessionAdjustmentReasonType));
    if (allowed.has(r)) params.out.reasonType = r;
  }

  /**
   * 追加订单号过滤
   * @param params 参数对象
   */
  private applyOrderRefFilter(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const orderRef = (params.src as { orderRef?: unknown }).orderRef;
    if (typeof orderRef !== 'string') return;
    const trimmed = orderRef.trim();
    if (trimmed.length > 0 && trimmed.length <= 64) {
      params.out.orderRef = trimmed;
    }
  }

  /**
   * 追加创建时间范围过滤
   * @param params 参数对象
   */
  private applyCreatedRangeFilter(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const createdFrom = this.normalizeDateTimeFilterValue({
      value: (params.src as { createdFrom?: unknown }).createdFrom,
      field: 'createdFrom',
    });
    const createdTo = this.normalizeDateTimeFilterValue({
      value: (params.src as { createdTo?: unknown }).createdTo,
      field: 'createdTo',
    });
    this.ensureCreatedRangeValid({ createdFrom, createdTo });
    if (createdFrom) params.out.createdFrom = createdFrom;
    if (createdTo) params.out.createdTo = createdTo;
  }

  /**
   * 追加增减方向过滤
   * @param params 参数对象
   */
  private applyDirectionFilter(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const direction = this.normalizeDirection({
      value: (params.src as { direction?: unknown }).direction,
    });
    if (direction) params.out.direction = direction;
  }

  /**
   * 追加客户姓名过滤
   * @param params 参数对象
   */
  private applyCustomerNameFilter(params: {
    readonly src: Readonly<Record<string, unknown>>;
    readonly out: Record<string, string | number | boolean>;
  }): void {
    const customerName = this.normalizeCustomerName({
      value:
        (params.src as { customerName?: unknown }).customerName ??
        (params.src as { name?: unknown }).name,
    });
    if (customerName) params.out.customerName = customerName;
  }

  /**
   * 规范化时间过滤字符串
   * @param params 参数对象
   */
  private normalizeDateTimeFilterValue(params: {
    readonly value?: unknown;
    readonly field: 'createdFrom' | 'createdTo';
  }): string | undefined {
    if (typeof params.value !== 'string') return undefined;
    const trimmed = trimText(params.value);
    if (!trimmed) return undefined;
    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) {
      throw new DomainError(
        PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS,
        `时间筛选参数无效：${params.field}`,
        { field: params.field, value: params.value },
      );
    }
    return trimmed;
  }

  /**
   * 校验创建时间区间合法性
   * @param params 参数对象
   */
  private ensureCreatedRangeValid(params: {
    readonly createdFrom?: string;
    readonly createdTo?: string;
  }): void {
    const { createdFrom, createdTo } = params;
    if (!createdFrom || !createdTo) return;
    const fromMs = Date.parse(createdFrom);
    const toMs = Date.parse(createdTo);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return;
    if (fromMs > toMs) {
      throw new DomainError(
        PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS,
        '时间筛选参数冲突：createdFrom 大于 createdTo',
        { createdFrom, createdTo },
      );
    }
  }

  /**
   * 规范化增减方向过滤
   * @param params 参数对象
   */
  private normalizeDirection(params: {
    readonly value?: unknown;
  }): AdjustmentDirection | undefined {
    if (typeof params.value !== 'string') return undefined;
    const trimmed = trimText(params.value);
    if (!trimmed) return undefined;
    const normalized = trimmed.toUpperCase();
    if (!ADJUSTMENT_DIRECTIONS.has(normalized as AdjustmentDirection)) {
      throw new DomainError(PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS, 'direction 无效', {
        direction: params.value,
      });
    }
    return normalized as AdjustmentDirection;
  }

  /**
   * 规范化客户姓名过滤
   * @param params 参数对象
   */
  private normalizeCustomerName(params: { readonly value?: unknown }): string | undefined {
    if (typeof params.value !== 'string') return undefined;
    const trimmed = trimText(params.value);
    if (!trimmed) return undefined;
    if (trimmed.length > 64) {
      throw new DomainError(
        PAYOUT_SESSION_ADJUSTMENT_ERROR.INVALID_PARAMS,
        'customerName 超出长度限制',
        { customerName: params.value },
      );
    }
    return trimmed;
  }
}
