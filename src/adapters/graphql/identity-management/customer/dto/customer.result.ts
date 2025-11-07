// src/adapters/graphql/identity-management/customer/dto/customer.result.ts

import { Field, ObjectType } from '@nestjs/graphql';
import { CustomerType } from '@src/adapters/graphql/account/dto/identity/customer.dto';

/**
 * 更新客户信息的 GraphQL 结果
 */
@ObjectType()
export class UpdateCustomerResult {
  @Field(() => CustomerType, { description: '客户信息' })
  customer!: CustomerType;
}

/**
 * 下线客户的 GraphQL 结果
 */
@ObjectType()
export class DeactivateCustomerResult {
  @Field(() => CustomerType, { description: '客户信息' })
  customer!: CustomerType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}

/**
 * 上线客户的 GraphQL 结果
 */
@ObjectType()
export class ReactivateCustomerResult {
  @Field(() => CustomerType, { description: '客户信息' })
  customer!: CustomerType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}
