// src/adapters/graphql/identity-management/customer/dto/customer.input.list-overdue.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 分页查询欠费客户列表的 GraphQL Input DTO
 */
@InputType()
export class ListOverdueCustomersInput {
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
}
