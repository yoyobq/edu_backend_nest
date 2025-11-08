// src/adapters/graphql/identity-management/coach/dto/coach.input.deactivate.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 下线教练的 GraphQL 输入参数
 */
@InputType()
export class DeactivateCoachInput {
  @Field(() => Int, { description: '教练 ID' })
  @IsInt({ message: '教练 ID 必须是整数' })
  @Min(1, { message: '教练 ID 必须大于 0' })
  id!: number;
}
