// src/modules/payout/session-adjustments/payout-session-adjustments.service.ts
import { decimalCompute } from '@core/common/numeric/decimal';
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
  beforeSessions: number;
  afterSessions: number;
  reasonType: SessionAdjustmentReasonType;
  reasonNote?: string | null;
  operatorAccountId?: number | null;
  orderRef?: string | null;
  manager?: EntityManager;
};

export type UpdateAdjustmentInput = {
  id: number;
  deltaSessions?: number;
  beforeSessions?: number;
  afterSessions?: number;
  reasonType?: SessionAdjustmentReasonType;
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
   * 根据 ID 查找课次调整记录
   * @param id 记录 ID
   */
  async findById(id: number): Promise<PayoutSessionAdjustmentEntity | null> {
    return await this.adjustmentRepo.findOne({ where: { id } });
  }

  /**
   * 按客户 ID 列出课次调整记录（按时间倒序）
   * @param customerId 客户 ID
   */
  async listByCustomer(customerId: number): Promise<PayoutSessionAdjustmentEntity[]> {
    return this.adjustmentRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  /**
   * 追加一条课次调整日志（不负责更新余额）
   * 将 delta / before / after 统一按两位小数规约为字符串入库
   * @param input 输入参数对象
   */
  async appendAdjustment(input: AppendAdjustmentInput): Promise<PayoutSessionAdjustmentEntity> {
    const aRepo = input.manager
      ? input.manager.getRepository(PayoutSessionAdjustmentEntity)
      : this.adjustmentRepo;

    const beforeStr = this.normalizeSessionsValue(input.beforeSessions);
    const afterStr = this.normalizeSessionsValue(input.afterSessions);

    const entity = aRepo.create({
      customerId: input.customerId,
      deltaSessions: this.normalizeSessionsValue(input.deltaSessions),
      beforeSessions: beforeStr,
      afterSessions: afterStr,
      reasonType: input.reasonType,
      reasonNote: input.reasonNote ?? null,
      operatorAccountId: input.operatorAccountId ?? null,
      orderRef: input.orderRef ?? null,
    });
    return await aRepo.save(entity);
  }

  /**
   * 更新课次调整记录（按 ID）
   * @param input 更新参数对象
   */
  async updateAdjustment(input: UpdateAdjustmentInput): Promise<PayoutSessionAdjustmentEntity> {
    const repo = input.manager
      ? input.manager.getRepository(PayoutSessionAdjustmentEntity)
      : this.adjustmentRepo;
    const patch: Partial<PayoutSessionAdjustmentEntity> = {};

    if (input.deltaSessions !== undefined) {
      patch.deltaSessions = this.normalizeSessionsValue(input.deltaSessions);
    }
    if (input.beforeSessions !== undefined) {
      patch.beforeSessions = this.normalizeSessionsValue(input.beforeSessions);
    }
    if (input.afterSessions !== undefined) {
      patch.afterSessions = this.normalizeSessionsValue(input.afterSessions);
    }
    if (input.reasonType !== undefined) {
      patch.reasonType = input.reasonType;
    }
    if (input.reasonNote !== undefined) {
      patch.reasonNote = input.reasonNote ?? null;
    }
    if (input.operatorAccountId !== undefined) {
      patch.operatorAccountId = input.operatorAccountId ?? null;
    }
    if (input.orderRef !== undefined) {
      patch.orderRef = input.orderRef ?? null;
    }

    await repo.update({ id: input.id }, patch);
    const fresh = await repo.findOne({ where: { id: input.id } });
    if (!fresh) throw new Error('更新后的课次调整记录未找到');
    return fresh;
  }

  /**
   * 规约课次数值为两位小数字符串
   * @param value 课次数值
   */
  private normalizeSessionsValue(value: number): string {
    return decimalCompute({
      op: 'add',
      a: 0,
      b: Number(value),
      outScale: 2,
    }).toFixed(2);
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
      searchColumns: [
        'psa.customer_id',
        'psa.reason_type',
        'psa.operator_account_id',
        'psa.order_ref',
      ],
      allowedFilters: ['customerId', 'reasonType', 'operatorAccountId', 'orderRef'],
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
          case 'orderRef':
            return 'psa.order_ref';
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
        'orderRef',
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
          clause: 'LOWER(psa.reason_type) LIKE LOWER(:q) OR LOWER(psa.order_ref) LIKE LOWER(:q)',
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
