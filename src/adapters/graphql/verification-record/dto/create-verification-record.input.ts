// src/adapters/graphql/verification-record/dto/create-verification-record.input.ts

import { SubjectType, VerificationRecordType } from '@app-types/models/verification-record.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * 创建验证记录输入参数
 */
@InputType({ description: '创建验证记录输入参数' })
export class CreateVerificationRecordInput {
  @Field(() => VerificationRecordType, { description: '记录类型' })
  @IsEnum(VerificationRecordType, { message: '记录类型无效' })
  type!: VerificationRecordType;

  @Field(() => String, { description: '令牌' })
  @IsString({ message: '令牌必须是字符串' })
  token!: string;

  @Field(() => Date, { description: '过期时间' })
  expiresAt!: Date;

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

  @Field(() => Int, { description: '签发者账号 ID', nullable: true })
  @IsOptional()
  @IsInt({ message: '签发者账号 ID 必须是整数' })
  issuedByAccountId?: number;
}
