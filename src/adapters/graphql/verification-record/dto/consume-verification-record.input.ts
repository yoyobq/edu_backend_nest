// src/adapters/graphql/verification-record/dto/consume-verification-record.input.ts

import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 消费验证记录输入参数
 */
@InputType({ description: '消费验证记录输入参数' })
export class ConsumeVerificationRecordInput {
  @Field(() => ID, { description: '验证记录 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: 'ID 必须是整数' })
  id?: number;

  @Field(() => String, { description: '验证令牌', nullable: true })
  @IsOptional()
  @IsString({ message: '令牌必须是字符串' })
  token?: string;

  @Field(() => Int, { description: '消费者账号 ID' })
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId!: number;
}
