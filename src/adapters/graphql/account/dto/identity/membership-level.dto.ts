// src/adapters/graphql/account/dto/identity/membership-level.dto.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 会员等级 GraphQL DTO
 * - 表达等级基本信息（id/code/name/benefits）
 */
@ObjectType({ description: '会员等级信息' })
export class MembershipLevelType {
  @Field(() => Int, { description: '会员等级 ID' })
  id!: number;

  @Field(() => String, { description: '会员等级代码' })
  code!: string;

  @Field(() => String, { description: '会员等级名称' })
  name!: string;

  @Field(() => String, { nullable: true, description: '等级权益（ JSON 序列化 ）' })
  benefits!: string | null;
}
