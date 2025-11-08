// src/adapters/graphql/identity-management/coach/dto/coach.input.reactivate.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 上线教练的 GraphQL 输入参数
 */
@InputType()
export class ReactivateCoachInput {
  @Field(() => Int, { description: '教练 ID' })
  @IsInt({ message: '教练 ID 必须是整数' })
  @Min(1, { message: '教练 ID 必须大于 0' })
  id!: number;
}
