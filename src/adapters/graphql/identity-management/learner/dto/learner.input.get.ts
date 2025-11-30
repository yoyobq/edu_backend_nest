// src/adapters/graphql/identity-management/learner/dto/learner.input.get.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * 获取单个学员信息的 GraphQL Input DTO
 */
@InputType()
export class GetLearnerInput {
  @Field(() => Int, { description: '学员 ID' })
  @IsInt({ message: '学员 ID 必须是整数' })
  @Min(1, { message: '学员 ID 必须大于 0' })
  learnerId!: number;

  @Field(() => Int, {
    nullable: true,
    description: '目标客户 ID（仅 manager 可选）',
  })
  @IsOptional()
  @IsInt({ message: '目标客户 ID 必须是整数' })
  @Min(1, { message: '目标客户 ID 必须大于 0' })
  customerId?: number;
}
