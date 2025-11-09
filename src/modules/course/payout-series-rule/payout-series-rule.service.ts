// src/modules/course/payout-series-rule/payout-series-rule.service.ts
import { type PayoutRuleJson } from '@app-types/models/payout-series-rule.types';
import type { CursorToken } from '@core/pagination/pagination.types';
import type { SearchOptions, SearchParams, SearchResult } from '@core/search/search.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmSearch } from '@src/infrastructure/typeorm/search/typeorm-search';
import { IsNull, Repository, type FindOptionsWhere, type SelectQueryBuilder } from 'typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';

/**
 * 课程系列结算规则服务
 * 提供规则的查询、创建与更新能力
 */
@Injectable()
export class PayoutSeriesRuleService {
  constructor(
    @InjectRepository(PayoutSeriesRuleEntity)
    private readonly ruleRepository: Repository<PayoutSeriesRuleEntity>,
  ) {}

  /**
   * 按 ID 查询规则
   * @param id 规则 ID
   */
  async findById(id: number): Promise<PayoutSeriesRuleEntity | null> {
    return this.ruleRepository.findOne({ where: { id } });
  }

  /**
   * 按系列 ID 查询规则（唯一）
   * @param seriesId 系列 ID（课程绑定规则）
   */
  async findBySeriesId(seriesId: number): Promise<PayoutSeriesRuleEntity | null> {
    return this.ruleRepository.findOne({ where: { seriesId } });
  }

  /**
   * 列出规则或模板
   * @param args 过滤参数
   * @returns 规则列表
   */
  async findAll(args?: {
    readonly isTemplate?: number;
    readonly isActive?: number;
    readonly seriesId?: number | null;
  }): Promise<PayoutSeriesRuleEntity[]> {
    const where: FindOptionsWhere<PayoutSeriesRuleEntity> = {};
    if (typeof args?.isTemplate === 'number') where.isTemplate = args.isTemplate;
    if (typeof args?.isActive === 'number') where.isActive = args.isActive;
    if (typeof args?.seriesId === 'number') where.seriesId = args.seriesId;
    if (args?.seriesId === null) where.seriesId = IsNull();
    return await this.ruleRepository.find({ where, order: { createdAt: 'DESC', id: 'DESC' } });
  }

  /**
   * 创建规则或模板（若同系列已存在则返回现有）
   * @param data 创建数据
   */
  async create(data: {
    seriesId: number | null;
    ruleJson: PayoutRuleJson;
    description?: string | null;
    isTemplate?: number;
    isActive?: number;
    createdBy?: number | null;
  }): Promise<PayoutSeriesRuleEntity> {
    if (data.seriesId != null) {
      const existing = await this.findBySeriesId(data.seriesId);
      if (existing) return existing;
    }
    const entity = this.ruleRepository.create({
      seriesId: data.seriesId ?? null,
      ruleJson: data.ruleJson,
      description: data.description ?? null,
      isTemplate: data.isTemplate ?? 0,
      isActive: data.isActive ?? 1,
      createdBy: data.createdBy ?? null,
      updatedBy: data.createdBy ?? null,
    });
    return this.ruleRepository.save(entity);
  }

  /**
   * 更新规则描述或启用状态（不改 JSON 规则）
   * @param id 规则 ID
   * @param patch 部分更新字段
   */
  async updateMeta(
    id: number,
    patch: Partial<
      Pick<PayoutSeriesRuleEntity, 'description' | 'isActive' | 'isTemplate' | 'updatedBy'>
    >,
  ): Promise<PayoutSeriesRuleEntity> {
    await this.ruleRepository.update({ id }, patch);
    const fresh = await this.ruleRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新后的规则未找到');
    return fresh;
  }

  /**
   * 更新 JSON 规则定义
   * @param id 规则 ID
   * @param ruleJson JSON 规则
   */
  async updateRuleJson(id: number, ruleJson: PayoutRuleJson): Promise<PayoutSeriesRuleEntity> {
    await this.ruleRepository.update({ id }, { ruleJson });
    const fresh = await this.ruleRepository.findOne({ where: { id } });
    if (!fresh) throw new Error('更新后的规则未找到');
    return fresh;
  }

  /**
   * 删除规则
   * @param id 规则 ID
   * @returns 是否删除成功
   */
  async deleteById(id: number): Promise<boolean> {
    const res = await this.ruleRepository.delete({ id });
    return (res.affected ?? 0) > 0;
  }

  /**
   * 启用规则
   * @param id 规则 ID
   * @param updatedBy 更新者账号 ID
   * @returns 更新后的实体或 null
   */
  async activateById(
    id: number,
    updatedBy?: number | null,
  ): Promise<PayoutSeriesRuleEntity | null> {
    const found = await this.findById(id);
    if (!found) return null;
    if (found.isActive === 1) return found;
    await this.ruleRepository.update({ id }, { isActive: 1, updatedBy: updatedBy ?? null });
    return (await this.findById(id)) ?? null;
  }

  /**
   * 停用规则
   * @param id 规则 ID
   * @param updatedBy 更新者账号 ID
   * @returns 更新后的实体或 null
   */
  async deactivateById(
    id: number,
    updatedBy?: number | null,
  ): Promise<PayoutSeriesRuleEntity | null> {
    const found = await this.findById(id);
    if (!found) return null;
    if (found.isActive === 0) return found;
    await this.ruleRepository.update({ id }, { isActive: 0, updatedBy: updatedBy ?? null });
    return (await this.findById(id)) ?? null;
  }

  /**
   * 绑定到课程系列（模板变为课程绑定规则）
   * @param ruleId 规则 ID（模板）
   * @param seriesId 课程系列 ID
   * @param updatedBy 更新者账号 ID
   * @returns 更新后的实体或 null（当系列已存在其他规则时可能失败）
   */
  async bindToSeries(
    ruleId: number,
    seriesId: number,
    updatedBy?: number | null,
  ): Promise<PayoutSeriesRuleEntity | null> {
    const found = await this.findById(ruleId);
    if (!found) return null;
    const conflict = await this.findBySeriesId(seriesId);
    if (conflict && conflict.id !== ruleId) {
      // 保持服务层简单：返回 null 表示绑定失败（由 usecase 抛领域错）
      return null;
    }
    await this.ruleRepository.update(
      { id: ruleId },
      { seriesId, isTemplate: 0, updatedBy: updatedBy ?? null },
    );
    return (await this.findById(ruleId)) ?? null;
  }

  /**
   * 解绑课程系列（课程绑定规则变为模板）
   * @param ruleId 规则 ID
   * @param updatedBy 更新者账号 ID
   * @returns 更新后的实体或 null
   */
  async unbindFromSeries(
    ruleId: number,
    updatedBy?: number | null,
  ): Promise<PayoutSeriesRuleEntity | null> {
    const found = await this.findById(ruleId);
    if (!found) return null;
    await this.ruleRepository.update(
      { id: ruleId },
      { seriesId: null, isTemplate: 1, updatedBy: updatedBy ?? null },
    );
    return (await this.findById(ruleId)) ?? null;
  }

  /**
   * 搜索与分页（排除 JSON 细项）
   * - 文本搜索：description
   * - 过滤：isTemplate / isActive / seriesId / createdAt / updatedAt（范围）
   * - 排序：createdAt / id / seriesId / isActive / isTemplate
   * - 分页：支持 OFFSET / CURSOR
   * @param input.params 搜索参数（含分页）
   */
  /**
   * @param input.params 搜索参数（含分页）
   * @param input.cursorToken 可选游标令牌（当提供 after/before 时必须）
   */
  async searchPaged(input: {
    readonly params: SearchParams;
    readonly cursorToken?: CursorToken;
  }): Promise<SearchResult<PayoutSeriesRuleEntity>> {
    const qb = this.ruleRepository.createQueryBuilder('psr') as unknown as SelectQueryBuilder<
      Record<string, unknown>
    >;

    const options: SearchOptions = {
      searchColumns: ['psr.description'],
      allowedFilters: [
        'isTemplate',
        'isActive',
        'seriesId',
        'createdFrom',
        'createdTo',
        'updatedFrom',
        'updatedTo',
      ],
      resolveColumn: (field: string): string | null => {
        switch (field) {
          case 'id':
            return 'psr.id';
          case 'seriesId':
            return 'psr.series_id';
          case 'isTemplate':
            return 'psr.is_template';
          case 'isActive':
            return 'psr.is_active';
          case 'createdAt':
            return 'psr.created_at';
          case 'updatedAt':
            return 'psr.updated_at';
          default:
            return null;
        }
      },
      allowedSorts: ['createdAt', 'id', 'seriesId', 'isActive', 'isTemplate'],
      defaultSorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'id', direction: 'DESC' },
      ],
      cursorKey: { primary: 'createdAt', tieBreaker: 'id' },
      cursorToken: input.cursorToken,
      buildFilter: ({ field, column, value }) => {
        if (field === 'seriesId' && value === null) {
          return { clause: 'psr.series_id IS NULL', params: {} };
        }
        if (field === 'seriesId') {
          return { clause: `${column} = :seriesId`, params: { seriesId: value } };
        }
        if (field === 'isTemplate') {
          return { clause: `${column} = :isTemplate`, params: { isTemplate: value } };
        }
        if (field === 'isActive') {
          return { clause: `${column} = :isActive`, params: { isActive: value } };
        }
        if (field === 'createdFrom') {
          return { clause: 'psr.created_at >= :createdFrom', params: { createdFrom: value } };
        }
        if (field === 'createdTo') {
          return { clause: 'psr.created_at <= :createdTo', params: { createdTo: value } };
        }
        if (field === 'updatedFrom') {
          return { clause: 'psr.updated_at >= :updatedFrom', params: { updatedFrom: value } };
        }
        if (field === 'updatedTo') {
          return { clause: 'psr.updated_at <= :updatedTo', params: { updatedTo: value } };
        }
        return null;
      },
    };

    const engine = new TypeOrmSearch();
    return await engine.search<PayoutSeriesRuleEntity>({ qb, params: input.params, options });
  }
}
