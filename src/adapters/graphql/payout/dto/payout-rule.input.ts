// src/adapters/graphql/payout/dto/payout-rule.input.ts
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { PaginationArgs, SortInput } from '@src/adapters/graphql/pagination.args';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

/**
 * 规则 JSON 入参（用于创建/更新）
 */
@InputType()
export class PayoutRuleJsonInput {
  @Field(() => Float, { description: '基础课酬（非负数，允许小数）' })
  base!: number;

  @Field(() => String, { description: '规则说明' })
  @IsString()
  @MaxLength(512)
  explain!: string;

  @Field(() => GraphQLJSON, { description: '乘数系数表（ JSON ）' })
  // 使用 JSON 标量，运行时应为 Record<string, number>
  factors!: Record<string, number>;
}

/**
 * 创建结算规则输入
 */
@InputType()
export class CreatePayoutRuleInput {
  @Field(() => Int, { nullable: true, description: '课程系列 ID；模板为 null' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seriesId?: number | null;

  @Field(() => PayoutRuleJsonInput, { description: '规则 JSON 定义' })
  @ValidateNested()
  @Type(() => PayoutRuleJsonInput)
  ruleJson!: PayoutRuleJsonInput;

  @Field(() => String, { nullable: true, description: '规则说明' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  // 改为 Boolean 输入，适配层转换为 0/1 写入用例
  @Field(() => Boolean, { nullable: true, description: '是否为模板（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @Field(() => Boolean, { nullable: true, description: '是否启用（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * 更新规则元信息输入
 */
@InputType()
export class UpdatePayoutRuleMetaInput {
  @Field(() => Int, { description: '规则 ID' })
  @IsInt()
  @Min(1)
  id!: number;

  @Field(() => String, { nullable: true, description: '规则说明' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @Field(() => Boolean, { nullable: true, description: '是否启用（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * 更新规则 JSON 输入
 */
@InputType()
export class UpdatePayoutRuleJsonInput {
  @Field(() => Int, { description: '规则 ID' })
  @IsInt()
  @Min(1)
  id!: number;

  @Field(() => PayoutRuleJsonInput, { description: '新的规则 JSON 定义' })
  @ValidateNested()
  @Type(() => PayoutRuleJsonInput)
  ruleJson!: PayoutRuleJsonInput;
}

/**
 * 绑定模板到课程系列输入
 */
@InputType()
export class BindPayoutRuleInput {
  @Field(() => Int, { description: '模板规则 ID' })
  @IsInt()
  @Min(1)
  ruleId!: number;

  @Field(() => Int, { description: '课程系列 ID' })
  @IsInt()
  @Min(1)
  seriesId!: number;
}

/**
 * 解绑课程系列输入
 */
@InputType()
export class UnbindPayoutRuleInput {
  @Field(() => Int, { description: '规则 ID（课程绑定规则）' })
  @IsInt()
  @Min(1)
  ruleId!: number;
}

/**
 * 按 ID 查询规则输入
 */
@InputType()
export class GetPayoutRuleByIdInput {
  @Field(() => Int, { description: '规则 ID' })
  @IsInt()
  @Min(1)
  id!: number;
}

/**
 * 按系列 ID 查询规则输入
 */
@InputType()
export class GetPayoutRuleBySeriesInput {
  @Field(() => Int, { description: '课程系列 ID' })
  @IsInt()
  @Min(1)
  seriesId!: number;
}

/**
 * 列表查询输入（过滤）
 */
@InputType()
export class ListPayoutRulesInput {
  @Field(() => Boolean, { nullable: true, description: '是否为模板（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @Field(() => Boolean, { nullable: true, description: '是否启用（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field(() => Int, { nullable: true, description: '课程系列 ID；模板用 null' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seriesId?: number | null;
}

/**
 * 停用/启用输入
 */
@InputType()
export class TogglePayoutRuleActiveInput {
  @Field(() => Int, { description: '规则 ID' })
  @IsInt()
  @Min(1)
  id!: number;
}

/**
 * 搜索与分页输入（对象参数）
 * - 统一承载搜索文本、过滤、排序与分页
 */
@InputType()
export class SearchPayoutRulesInput {
  @Field(() => String, { nullable: true, description: '文本搜索（匹配 description）' })
  @IsOptional()
  @IsString()
  query?: string;

  @Field(() => PaginationArgs, { description: '分页参数（支持 OFFSET/CURSOR）' })
  @ValidateNested()
  @Type(() => PaginationArgs)
  pagination!: PaginationArgs;

  @Field(() => [SortInput], { nullable: true, description: '排序列表' })
  @IsOptional()
  sorts?: SortInput[];

  @Field(() => Boolean, { nullable: true, description: '是否为模板（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @Field(() => Boolean, { nullable: true, description: '是否启用（ true/false ）' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field(() => Boolean, { nullable: true, description: '仅模板（ seriesId 为 null ）' })
  @IsOptional()
  @IsBoolean()
  onlyTemplates?: boolean;

  @Field(() => Int, { nullable: true, description: '课程系列 ID；模板用 null' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seriesId?: number | null;

  @Field(() => String, { nullable: true, description: '创建时间起（ISO 字符串）' })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @Field(() => String, { nullable: true, description: '创建时间止（ISO 字符串）' })
  @IsOptional()
  @IsString()
  createdTo?: string;

  @Field(() => String, { nullable: true, description: '更新时间起（ISO 字符串）' })
  @IsOptional()
  @IsString()
  updatedFrom?: string;

  @Field(() => String, { nullable: true, description: '更新时间止（ISO 字符串）' })
  @IsOptional()
  @IsString()
  updatedTo?: string;
}
