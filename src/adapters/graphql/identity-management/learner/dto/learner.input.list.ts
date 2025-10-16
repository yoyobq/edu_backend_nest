// src/adapters/graphql/identity-management/learner/dto/learner.input.list.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { LearnerSortField, OrderDirection } from '@src/types/common/sort.types';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 分页查询学员列表的 GraphQL Input DTO
 * 支持两种查询方式：
 * 1. 通过 managerId 查询（传统方式，保持向后兼容）
 * 2. 通过 customerId 查询（新方式，支持客户范围查询）
 * 注意：业务逻辑验证（如参数互斥性）由 usecase 层处理
 */
@InputType()
export class ListLearnersInput {
  @Field(() => Int, { nullable: true, description: '管理员 ID，用于查询该管理员负责的学员' })
  @IsOptional()
  @IsInt({ message: '管理员 ID 必须是整数' })
  @Min(1, { message: '管理员 ID 必须大于 0' })
  managerId?: number;

  @Field(() => Int, { nullable: true, description: '客户 ID，用于查询该客户下的所有学员' })
  @IsOptional()
  @IsInt({ message: '客户 ID 必须是整数' })
  @Min(1, { message: '客户 ID 必须大于 0' })
  customerId?: number;

  @Field(() => Int, { nullable: true, description: '页码，从 1 开始', defaultValue: 1 })
  @IsOptional()
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码必须大于等于 1' })
  page?: number = 1;

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

  @Field(() => LearnerSortField, {
    nullable: true,
    description: '排序字段',
    defaultValue: LearnerSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(LearnerSortField, { message: '排序字段必须是有效的枚举值' })
  sortBy?: LearnerSortField = LearnerSortField.CREATED_AT;

  @Field(() => OrderDirection, {
    nullable: true,
    description: '排序方向',
    defaultValue: OrderDirection.DESC,
  })
  @IsOptional()
  @IsEnum(OrderDirection, { message: '排序方向必须是有效的枚举值' })
  sortOrder?: OrderDirection = OrderDirection.DESC;
}
