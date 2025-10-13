// src/adapters/graphql/identity-management/learner/dto/learners.output.ts

import { Field, Int, ObjectType } from '@nestjs/graphql';
import { LearnerOutput } from './learner.output';

/**
 * 分页信息
 */
@ObjectType()
export class PaginationInfo {
  @Field(() => Int, { description: '当前页码', nullable: false })
  page!: number;

  @Field(() => Int, { description: '每页数量', nullable: false })
  limit!: number;

  @Field(() => Int, { description: '总记录数', nullable: false })
  total!: number;

  @Field(() => Int, { description: '总页数', nullable: false })
  totalPages!: number;

  @Field(() => Boolean, { description: '是否有下一页', nullable: false })
  hasNext!: boolean;

  @Field(() => Boolean, { description: '是否有上一页', nullable: false })
  hasPrev!: boolean;
}

/**
 * 分页查询学员列表的 GraphQL Output DTO
 */
@ObjectType()
export class ListLearnersOutput {
  @Field(() => [LearnerOutput], { description: '学员列表', nullable: false })
  learners!: LearnerOutput[];

  @Field(() => PaginationInfo, { description: '分页信息', nullable: false })
  pagination!: PaginationInfo;
}
