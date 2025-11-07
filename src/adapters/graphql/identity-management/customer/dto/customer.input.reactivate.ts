// src/adapters/graphql/identity-management/customer/dto/customer.input.reactivate.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 上线客户的 GraphQL 输入参数
 */
@InputType()
export class ReactivateCustomerInput {
  @Field(() => Int, { description: '客户 ID' })
  @IsInt({ message: '客户 ID 必须是整数' })
  @Min(1, { message: '客户 ID 必须大于 0' })
  id!: number;
}
