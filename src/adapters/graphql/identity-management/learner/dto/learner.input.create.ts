// src/adapters/graphql/identity-management/learner/dto/learner.input.create.ts

import { Gender } from '@app-types/models/user-info.types';
import { Field, Float, InputType } from '@nestjs/graphql';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 创建学员输入参数
 */
@InputType({ description: '创建学员输入参数' })
export class CreateLearnerInput {
  @Field(() => String, { description: '学员姓名' })
  @IsString({ message: '学员姓名必须是字符串' })
  @IsNotEmpty({ message: '学员姓名不能为空' })
  @MaxLength(50, { message: '学员姓名不能超过 50 个字符' })
  name!: string;

  @Field(() => Gender, { description: '性别' })
  @IsEnum(Gender, { message: '性别值无效' })
  gender!: Gender;

  @Field(() => String, { description: '出生日期 (YYYY-MM-DD 格式)' })
  @IsDateString({}, { message: '出生日期格式无效，请使用 YYYY-MM-DD 格式' })
  birthDate!: string;

  @Field(() => String, { description: '头像 URL', nullable: true })
  @IsOptional()
  @IsString({ message: '头像 URL 必须是字符串' })
  @MaxLength(500, { message: '头像 URL 不能超过 500 个字符' })
  avatarUrl?: string;

  @Field(() => String, { description: '特殊需求说明', nullable: true })
  @IsOptional()
  @IsString({ message: '特殊需求说明必须是字符串' })
  @MaxLength(500, { message: '特殊需求说明不能超过 500 个字符' })
  specialNeeds?: string;

  @Field(() => String, { description: '备注信息', nullable: true })
  @IsOptional()
  @IsString({ message: '备注信息必须是字符串' })
  @MaxLength(500, { message: '备注信息不能超过 500 个字符' })
  remark?: string;

  @Field(() => Float, { description: '每节课人数', nullable: true, defaultValue: 1 })
  @IsOptional()
  countPerSession?: number;
}
