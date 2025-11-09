// src/adapters/graphql/payout/dto/payout-rule.dto.ts
import { Field, Int, Float, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * 结算规则 JSON 类型（GraphQL）
 * 对应核心模型 `PayoutRuleJson`
 */
@ObjectType({ description: '课酬规则 JSON 定义' })
export class PayoutRuleJsonDTO {
  @Field(() => Float, { description: '基础课酬（非负数，允许小数）' })
  base!: number;

  @Field(() => String, { description: '规则说明（人类可读）' })
  explain!: string;

  // factors 是一个键值对，需要使用 JSON 标量承载
  @Field(() => GraphQLJSON, { description: '乘数系数表（ JSON ）' })
  // 说明：GraphQL 层使用 JSON 标量，运行时为 Record<string, number>
  // 解析与序列化由 GraphQL JSON 标量负责
  factors!: Record<string, number>;
}

/**
 * 结算规则实体 GraphQL 输出类型
 */
@ObjectType({ description: '课程系列课酬规则/模板' })
export class PayoutSeriesRuleType {
  @Field(() => Int, { description: '规则 ID' })
  id!: number;

  @Field(() => Int, { nullable: true, description: '绑定的课程系列 ID，模板为 null' })
  seriesId!: number | null;

  @Field(() => PayoutRuleJsonDTO, { description: '规则 JSON 定义' })
  ruleJson!: PayoutRuleJsonDTO;

  @Field(() => String, { nullable: true, description: '规则说明' })
  description!: string | null;

  @Field(() => Int, { description: '是否为模板（1/0）' })
  isTemplate!: number;

  @Field(() => Int, { description: '是否启用（1/0）' })
  isActive!: number;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Int, { nullable: true, description: '创建者账号 ID' })
  createdBy!: number | null;

  @Field(() => Int, { nullable: true, description: '更新者账号 ID' })
  updatedBy!: number | null;
}
