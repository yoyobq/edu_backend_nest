// src/usecases/course/payout/create-payout-rule.usecase.ts
import { type PayoutRuleJson } from '@app-types/models/payout-series-rule.types';
import { DomainError, PAYOUT_RULE_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { PayoutSeriesRuleEntity } from '@src/modules/course/payout-series-rule/payout-series-rule.entity';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

/**
 * 创建结算规则/模板用例
 *
 * 功能：
 * - 支持创建模板（`seriesId = null`）或为指定课程系列创建绑定规则（`seriesId = number`）
 * - 若指定系列已存在规则，则幂等返回现有规则
 */
@Injectable()
export class CreatePayoutRuleUsecase {
  constructor(private readonly ruleService: PayoutSeriesRuleService) {}

  /**
   * 执行创建结算规则/模板
   * @param args 创建参数对象
   * @returns 创建结果与是否新建标记
   */
  async execute(args: {
    readonly seriesId: number | null;
    readonly ruleJson: PayoutRuleJson;
    readonly description?: string | null;
    readonly isTemplate?: number; // 1=模板，0=课程绑定规则；当 seriesId=null 时建议传 1
    readonly isActive?: number; // 1=启用，0=停用
    readonly session: UsecaseSession;
  }): Promise<{ rule: PayoutSeriesRuleEntity; isNewlyCreated: boolean }> {
    // 统一 JSON 校验：base 非负，factors 为有限数字
    if (args.ruleJson.base < 0) {
      throw new DomainError(PAYOUT_RULE_ERROR.JSON_INVALID, 'rule_json.base 不能为负数', {
        base: args.ruleJson.base,
      });
    }
    for (const [k, v] of Object.entries(args.ruleJson.factors)) {
      if (typeof v !== 'number' || Number.isNaN(v)) {
        throw new DomainError(
          PAYOUT_RULE_ERROR.JSON_INVALID,
          'rule_json.factors 的值必须为有效数字',
          { key: k, value: v },
        );
      }
    }

    // 模板/系列互斥校验：seriesId=null → isTemplate 应为 1；seriesId!=null → isTemplate 应为 0
    const desiredIsTemplate = args.seriesId == null ? 1 : 0;
    if (typeof args.isTemplate === 'number' && args.isTemplate !== desiredIsTemplate) {
      throw new DomainError(
        PAYOUT_RULE_ERROR.INVALID_TEMPLATE_FLAG,
        'isTemplate 与 seriesId 不一致：模板/系列互斥违规',
        { seriesId: args.seriesId, isTemplate: args.isTemplate, expected: desiredIsTemplate },
      );
    }

    try {
      if (args.seriesId != null) {
        const existing = await this.ruleService.findBySeriesId(args.seriesId);
        if (existing) {
          return { rule: existing, isNewlyCreated: false };
        }
      }

      const created = await this.ruleService.create({
        seriesId: args.seriesId,
        ruleJson: args.ruleJson,
        description: args.description ?? null,
        isTemplate: args.isTemplate ?? desiredIsTemplate,
        isActive: args.isActive ?? 1,
        createdBy: args.session.accountId,
      });
      return { rule: created, isNewlyCreated: true };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(PAYOUT_RULE_ERROR.RULE_CREATION_FAILED, '创建结算规则失败', { error });
    }
  }
}
