// src/adapters/graphql/identity-management/learner/dto/learner.input.delete.ts

import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 删除学员的 GraphQL Input DTO
 */
@InputType()
export class DeleteLearnerInput {
  @Field(() => Int, { description: '学员 ID' })
  @IsInt({ message: '学员 ID 必须是整数' })
  @Min(1, { message: '学员 ID 必须大于 0' })
  learnerId!: number;
}
