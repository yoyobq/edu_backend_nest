// src/adapters/graphql/verification-record/dto/update-verification-record.input.ts

import { SubjectType, VerificationRecordStatus } from '@app-types/models/verification-record.types';
import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 更新验证记录输入参数
 */
@InputType({ description: '更新验证记录输入参数' })
export class UpdateVerificationRecordInput {
  @Field(() => ID, { description: '验证记录 ID' })
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;

  @Field(() => VerificationRecordStatus, { description: '记录状态', nullable: true })
  @IsOptional()
  @IsEnum(VerificationRecordStatus, { message: '记录状态无效' })
  status?: VerificationRecordStatus;

  @Field(() => Date, { description: '过期时间', nullable: true })
  @IsOptional()
  expiresAt?: Date;

  @Field(() => Date, { description: '生效时间', nullable: true })
  @IsOptional()
  notBefore?: Date;

  @Field(() => Int, { description: '目标账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '目标账号 ID 必须是整数' })
  targetAccountId?: number;

  @Field(() => SubjectType, { description: '主体类型', nullable: true })
  @IsOptional()
  @IsEnum(SubjectType, { message: '主体类型无效' })
  subjectType?: SubjectType;

  @Field(() => Int, { description: '主体 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '主体 ID 必须是整数' })
  subjectId?: number;

  @Field(() => String, { description: '载荷数据（JSON 字符串）', nullable: true })
  @IsOptional()
  @IsString({ message: '载荷数据必须是字符串' })
  payload?: string;

  @Field(() => Int, { description: '消费者账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '消费者账号 ID 必须是整数' })
  consumedByAccountId?: number;

  @Field(() => Date, { description: '消费时间', nullable: true })
  @IsOptional()
  consumedAt?: Date;
}
