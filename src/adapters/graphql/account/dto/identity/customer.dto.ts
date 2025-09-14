// src/adapters/graphql/account/dto/identity/customer.dto.ts

import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 客户身份信息 DTO
 */
@ObjectType({ description: '客户身份信息' })
export class CustomerType {
  @Field(() => ID, { description: '客户 ID' })
  id!: number;

  @Field(() => ID, { description: '关联的账户 ID', nullable: true })
  accountId!: number | null;

  @Field(() => String, { description: '客户姓名' })
  name!: string;

  @Field(() => String, { description: '备用联系电话', nullable: true })
  contactPhone!: string | null;

  @Field(() => String, { description: '联络偏好时间', nullable: true })
  preferredContactTime!: string | null;

  @Field(() => String, { description: '会员等级', nullable: true })
  membershipLevel!: string | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remarks!: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt!: Date | null;
}
