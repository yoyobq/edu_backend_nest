// src/adapters/graphql/identity-management/customer/dto/customers.list.ts

import { Field, ObjectType } from '@nestjs/graphql';
import { CustomerType } from '../../../account/dto/identity/customer.dto';
import { PaginationInfo } from '../../learner/dto/learners.list';

/**
 * 分页查询客户列表的 GraphQL Output DTO
 */
@ObjectType()
export class ListCustomersOutput {
  @Field(() => [CustomerType], { description: '客户列表', nullable: false })
  customers!: CustomerType[];

  @Field(() => PaginationInfo, { description: '分页信息', nullable: false })
  pagination!: PaginationInfo;
}
