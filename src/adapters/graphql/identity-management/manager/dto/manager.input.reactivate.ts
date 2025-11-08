// src/adapters/graphql/identity-management/manager/dto/manager.input.reactivate.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 上线经理的 GraphQL 输入参数
 */
@InputType()
export class ReactivateManagerInput {
  @Field(() => Int, { description: '经理 ID' })
  @IsInt({ message: '经理 ID 必须是整数' })
  @Min(1, { message: '经理 ID 必须大于 0' })
  id!: number;
}
