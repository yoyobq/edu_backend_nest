// src/adapters/graphql/identity-management/learner/dto/learner.input.update.ts

import { Gender } from '@app-types/models/user-info.types';
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 更新学员信息的 GraphQL Input DTO
 */
@InputType()
export class UpdateLearnerInput {
  @Field(() => Int, { description: '学员 ID' })
  @IsInt({ message: '学员 ID 必须是整数' })
  @Min(1, { message: '学员 ID 必须大于 0' })
  learnerId!: number;

  @Field(() => Int, { nullable: true, description: '目标客户 ID（Manager 必须指定）' })
  @IsOptional()
  @IsInt({ message: '客户 ID 必须是整数' })
  @Min(1, { message: '客户 ID 必须大于 0' })
  customerId?: number;

  @Field({ nullable: true, description: '学员姓名' })
  @IsOptional()
  @IsString({ message: '学员姓名必须是字符串' })
  @IsNotEmpty({ message: '学员姓名不能为空' })
  @MaxLength(50, { message: '学员姓名不能超过 50 个字符' })
  name?: string;

  @Field(() => Gender, { nullable: true, description: '性别' })
  @IsOptional()
  @IsEnum(Gender, { message: '性别必须是有效的枚举值' })
  gender?: Gender;

  @Field({ nullable: true, description: '出生日期 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: '出生日期格式无效，请使用 YYYY-MM-DD 格式' })
  birthDate?: string;

  @Field({ nullable: true, description: '头像 URL' })
  @IsOptional()
  @IsUrl({}, { message: '头像 URL 格式不正确' })
  @MaxLength(500, { message: '头像 URL 不能超过 500 个字符' })
  avatarUrl?: string;

  @Field({ nullable: true, description: '特殊需求' })
  @IsOptional()
  @IsString({ message: '特殊需求必须是字符串' })
  @MaxLength(500, { message: '特殊需求不能超过 500 个字符' })
  specialNeeds?: string;

  @Field({ nullable: true, description: '备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(500, { message: '备注不能超过 500 个字符' })
  remark?: string;

  @Field(() => Float, { nullable: true, description: '每节课人数' })
  @IsOptional()
  countPerSession?: number;
}
