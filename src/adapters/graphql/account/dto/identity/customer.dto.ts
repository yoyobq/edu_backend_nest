// src/adapters/graphql/account/dto/identity/customer.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 客户身份信息 DTO
 */
@ObjectType({ description: '客户身份信息' })
export class CustomerType {
  @Field(() => Int, { description: '客户 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID', nullable: true })
  accountId!: number | null;

  @Field(() => String, { description: '客户姓名' })
  name!: string;

  @Field(() => String, { description: '备用联系电话', nullable: true })
  contactPhone!: string | null;

  @Field(() => String, { description: '联络偏好时间', nullable: true })
  preferredContactTime!: string | null;

  @Field(() => Number, { description: '会员等级', nullable: true })
  membershipLevel!: number | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null; // 修正：从 remarks 改为 remark，与实体字段名保持一致

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt!: Date | null;
}
