// src/adapters/graphql/identity-management/manager/dto/manager.input.list.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { ManagerSortField, OrderDirection } from '@src/types/common/sort.types';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GraphQL 输入：经理列表查询入参
 */
@InputType()
export class ListManagersInput {
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

  @Field(() => ManagerSortField, {
    nullable: true,
    description: '排序字段：创建时间、更新时间、姓名',
    defaultValue: ManagerSortField.CREATED_AT,
  })
  @IsOptional()
  sortBy?: ManagerSortField = ManagerSortField.CREATED_AT;

  @Field(() => OrderDirection, {
    nullable: true,
    description: '排序方向',
    defaultValue: OrderDirection.DESC,
  })
  @IsOptional()
  @IsEnum(OrderDirection, { message: '排序方向不合法' })
  sortOrder?: OrderDirection = OrderDirection.DESC;

  /** 是否包含已下线数据（默认不包含） */
  @Field(() => Boolean, { nullable: true, description: '是否包含已下线数据', defaultValue: false })
  @IsOptional()
  includeDeleted?: boolean = false;
}
