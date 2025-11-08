// src/modules/payout-series-rule/payout-series-rule.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayoutSeriesRuleEntity } from './payout-series-rule.entity';
import { type PayoutRuleJson } from '@app-types/models/payout-series-rule.types';

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
}
