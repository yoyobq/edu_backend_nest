// src/adapters/graphql/identity-management/customer/dto/customer.input.get.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

@InputType()
export class GetCustomerInput {
  @Field(() => Int, { nullable: true, description: '客户 ID（仅 manager；必填）' })
  @IsOptional()
  @IsInt({ message: '客户 ID 必须是整数' })
  @Min(1, { message: '客户 ID 必须大于 0' })
  customerId?: number;
}
