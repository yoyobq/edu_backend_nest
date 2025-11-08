// src/adapters/graphql/identity-management/manager/dto/manager.input.deactivate.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

/**
 * 下线经理的 GraphQL 输入参数
 */
@InputType()
export class DeactivateManagerInput {
  @Field(() => Int, { description: '经理 ID（仅允许下线自己）' })
  @IsInt({ message: '经理 ID 必须是整数' })
  @Min(1, { message: '经理 ID 必须大于 0' })
  id!: number;
}
