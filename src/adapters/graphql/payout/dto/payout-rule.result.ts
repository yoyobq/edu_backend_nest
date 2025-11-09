// src/adapters/graphql/payout/dto/payout-rule.result.ts
/**
 * 设计结论：删除用例 DeletePayoutRuleUsecase 通常不必要且不应对外暴露。
 * 理由：
 * - 解析器未暴露删除入口，现有流程用 停用 / 解绑 即可满足。
 * - 硬删除风险高：破坏历史可追溯性，可能影响外键一致性。
 * - 当前无调用方，仅在模块注册，建议保持内部或移除注册。
 * 建议：
 * - 默认不开放删除能力，优先使用 停用 + 解绑。
 * - 若必须清理：采用软删除或严格前置校验，并补充领域错误码。
 */
import { Field, ObjectType } from '@nestjs/graphql';
import { PayoutSeriesRuleType } from './payout-rule.dto';

/**
 * 创建结算规则结果
 */
@ObjectType()
export class CreatePayoutRuleResult {
  @Field(() => PayoutSeriesRuleType, { description: '结算规则实体' })
  rule!: PayoutSeriesRuleType;

  @Field(() => Boolean, { description: '是否新建（幂等时为 false）' })
  isNewlyCreated!: boolean;
}

/**
 * 下线/上线结果
 */
@ObjectType()
export class TogglePayoutRuleActiveResult {
  @Field(() => PayoutSeriesRuleType, { description: '结算规则实体' })
  rule!: PayoutSeriesRuleType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}

/**
 * 更新结果（元信息或 JSON）
 */
@ObjectType()
export class UpdatePayoutRuleResult {
  @Field(() => PayoutSeriesRuleType, { description: '更新后的结算规则实体' })
  rule!: PayoutSeriesRuleType;
}

/**
 * 解绑或绑定结果
 */
@ObjectType()
export class BindOrUnbindPayoutRuleResult {
  @Field(() => PayoutSeriesRuleType, { description: '更新后的结算规则实体' })
  rule!: PayoutSeriesRuleType;

  @Field(() => Boolean, { nullable: true, description: '是否发生状态变更（幂等为 false）' })
  isUpdated?: boolean;
}

/**
 * 规则列表结果
 */
@ObjectType()
export class ListPayoutRulesResult {
  @Field(() => [PayoutSeriesRuleType], { description: '规则列表' })
  items!: PayoutSeriesRuleType[];
}
