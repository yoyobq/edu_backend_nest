// src/adapters/graphql/identity-management/learner/dto/learner.arg.ts

import { Gender } from '@app-types/models/user-info.types';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/**
 * 学员信息的 GraphQL Output DTO
 */
@ObjectType()
export class LearnerOutput {
  @Field(() => Int, { description: '学员 ID' })
  id!: number;

  @Field({ description: '学员姓名' })
  name!: string;

  @Field(() => Gender, { description: '性别' })
  gender!: Gender;

  @Field(() => String, { nullable: true, description: '出生日期 (YYYY-MM-DD)' })
  birthDate?: string | null;

  @Field(() => String, { nullable: true, description: '头像 URL' })
  avatarUrl?: string | null;

  @Field(() => String, { nullable: true, description: '特殊需求' })
  specialNeeds?: string | null;

  @Field(() => Float, { description: '每次课程数量' })
  countPerSession!: number;

  @Field(() => String, { nullable: true, description: '备注' })
  remark?: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
