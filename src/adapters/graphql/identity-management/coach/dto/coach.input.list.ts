// src/adapters/graphql/dto/coach/coach.input.list.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { CoachSortField, OrderDirection } from '@src/types/common/sort.types';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GraphQL 输入：教练列表查询入参
 */
@InputType()
export class ListCoachesInput {
  /** 页码，从 1 开始 */
  @Field(() => Int, { nullable: true, description: '页码，从 1 开始', defaultValue: 1 })
  @IsOptional()
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码必须大于等于 1' })
  page?: number = 1;

  /** 每页数量，默认 10，最大 100 */
  @Field(() => Int, {
    nullable: true,
    description: '每页数量，默认 10，最大 100',
    defaultValue: 10,
  })
  @IsOptional()
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量必须大于等于 1' })
  @Max(100, { message: '每页数量不能超过 100' })
  limit?: number = 10;

  @Field(() => CoachSortField, {
    nullable: true,
    description: '排序字段：创建时间、更新时间、姓名',
    defaultValue: CoachSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(CoachSortField, { message: '排序字段不合法' })
  sortBy?: CoachSortField = CoachSortField.CREATED_AT;

  @Field(() => OrderDirection, {
    nullable: true,
    description: '排序方向',
    defaultValue: OrderDirection.DESC,
  })
  @IsOptional()
  @IsEnum(OrderDirection, { message: '排序方向不合法' })
  sortOrder?: OrderDirection = OrderDirection.DESC;

  @Field(() => String, {
    nullable: true,
    description: '搜索关键词（姓名/手机号）',
  })
  @IsOptional()
  query?: string;

  @Field(() => Boolean, {
    nullable: true,
    description: '是否包含已停用记录',
    defaultValue: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'includeDeleted 必须是布尔值' })
  includeDeleted?: boolean = true;
}
