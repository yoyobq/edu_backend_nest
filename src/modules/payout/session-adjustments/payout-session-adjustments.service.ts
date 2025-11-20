// src/modules/payout/session-adjustments/payout-session-adjustments.service.ts
import type { CursorToken } from '@core/pagination/pagination.types';
import type { SearchOptions, SearchParams, SearchResult } from '@core/search/search.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SearchService } from '@src/modules/common/search.module';
import { EntityManager, Repository, type SelectQueryBuilder } from 'typeorm';
import {
  PayoutSessionAdjustmentEntity,
  SessionAdjustmentReasonType,
} from './payout-session-adjustment.entity';

export type AppendAdjustmentInput = {
  customerId: number;
  deltaSessions: number;
  beforeSessions: string;
  afterSessions: string;
  reasonType: SessionAdjustmentReasonType;
  reasonNote?: string | null;
  operatorAccountId?: number | null;
  orderRef?: string | null;
  manager?: EntityManager;
};

@Injectable()
export class PayoutSessionAdjustmentsService {
  constructor(
    @InjectRepository(PayoutSessionAdjustmentEntity)
    private readonly adjustmentRepo: Repository<PayoutSessionAdjustmentEntity>,
    private readonly searchService: SearchService,
  ) {}

  /**
   * 按客户 ID 列出课次调整记录（按时间倒序）
   * @param customerId 客户 ID
   */
  async listByCustomer(customerId: number): Promise<PayoutSessionAdjustmentEntity[]> {
    return this.adjustmentRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  /**
   * 追加一条课次调整日志（不负责更新余额）
   * @param input 输入参数对象
   */
  async appendAdjustment(input: AppendAdjustmentInput): Promise<PayoutSessionAdjustmentEntity> {
    const aRepo = input.manager
      ? input.manager.getRepository(PayoutSessionAdjustmentEntity)
      : this.adjustmentRepo;

    const entity = aRepo.create({
      customerId: input.customerId,
      deltaSessions: Number(input.deltaSessions).toFixed(2),
      beforeSessions: input.beforeSessions,
      afterSessions: input.afterSessions,
      reasonType: input.reasonType,
      reasonNote: input.reasonNote ?? null,
      operatorAccountId: input.operatorAccountId ?? null,
      orderRef: input.orderRef ?? null,
    });
    return await aRepo.save(entity);
  }

  /**
   * 搜索与分页课次调整记录
   * @param input 搜索参数与可选游标令牌
   */
  async searchPaged(input: {
    readonly params: SearchParams;
    readonly cursorToken?: CursorToken;
  }): Promise<SearchResult<PayoutSessionAdjustmentEntity>> {
    const qb = this.adjustmentRepo.createQueryBuilder('psa') as unknown as SelectQueryBuilder<
      Record<string, unknown>
    >;

    const options: SearchOptions = {
      searchColumns: ['psa.customer_id', 'psa.reason_type', 'psa.operator_account_id'],
      allowedFilters: ['customerId', 'reasonType', 'operatorAccountId'],
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'id':
            return 'psa.id';
          case 'customerId':
            return 'psa.customer_id';
          case 'operatorAccountId':
            return 'psa.operator_account_id';
          case 'reasonType':
            return 'psa.reason_type';
          case 'deltaSessions':
            return 'psa.delta_sessions';
          case 'createdAt':
            return 'psa.created_at';
          default:
            return null;
        }
      },
      allowedSorts: [
        'createdAt',
        'id',
        'customerId',
        'operatorAccountId',
        'reasonType',
        'deltaSessions',
      ],
      defaultSorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'id', direction: 'DESC' },
      ],
      cursorKey: { primary: 'createdAt', tieBreaker: 'id' },
      cursorToken: input.cursorToken,
      buildTextSearch: ({ query }) => {
        const raw = query.trim();
        const isNumeric = /^\d+$/.test(raw);
        if (isNumeric) {
          return {
            clause: '(psa.customer_id = :qInt OR psa.operator_account_id = :qInt)',
            params: { qInt: Number(raw) },
          };
        }
        return {
          clause: 'LOWER(psa.reason_type) LIKE LOWER(:q)',
          params: { q: `%${raw}%` },
        };
      },
    };

    return await this.searchService.search<PayoutSessionAdjustmentEntity>({
      qb,
      params: input.params,
      options,
    });
  }
}
