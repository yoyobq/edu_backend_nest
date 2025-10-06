// src/adapters/graphql/account/dto/identity/learner.dto.ts

import { Gender } from '@app-types/models/user-info.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 学员身份信息 DTO
 */
@ObjectType({ description: '学员身份信息' })
export class LearnerType {
  @Field(() => Int, { description: '学员 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID', nullable: true })
  accountId!: number | null;

  @Field(() => Number, { description: '所属客户 ID' })
  customerId!: number;

  @Field(() => String, { description: '学员姓名' })
  name!: string;

  @Field(() => Gender, { description: '性别' })
  gender!: Gender;

  @Field(() => String, { description: '出生日期', nullable: true })
  birthDate!: string | null;

  @Field(() => String, { description: '头像 URL', nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { description: '特殊需求/注意事项', nullable: true })
  specialNeeds!: string | null;

  @Field(() => Number, { description: '统一计次比例' })
  countPerSession!: number;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt!: Date | null;
}
