// src/adapters/graphql/course/series/dto/create-course-series-draft.input.ts
import { ClassMode, VenueType } from '@app-types/models/course-series.types';
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class CreateCourseSeriesDraftInput {
  @Field(() => Int, { description: '课程目录 ID' })
  @IsInt({ message: '课程目录 ID 必须是整数' })
  @Min(1, { message: '课程目录 ID 必须大于 0' })
  catalogId!: number;

  @Field(() => String, { nullable: true, description: '系列标题' })
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(120, { message: '标题长度不能超过 120 个字符' })
  title?: string;

  @Field(() => String, { nullable: true, description: '系列描述' })
  @IsOptional()
  @IsString({ message: '描述必须是字符串' })
  @MaxLength(512, { message: '描述长度不能超过 512 个字符' })
  description?: string | null;

  @Field(() => VenueType, { nullable: true, description: '上课地点类型' })
  @IsOptional()
  @IsEnum(VenueType, { message: '上课地点类型无效' })
  venueType?: VenueType;

  @Field(() => ClassMode, { nullable: true, description: '班型' })
  @IsOptional()
  @IsEnum(ClassMode, { message: '班型类型无效' })
  classMode?: ClassMode;

  @Field(() => String, { description: '开班起始日期 (YYYY-MM-DD)' })
  @IsDateString({ strict: true }, { message: '起始日期格式应为 YYYY-MM-DD' })
  startDate!: string;

  @Field(() => String, { description: '开班结束日期 (YYYY-MM-DD)' })
  @IsDateString({ strict: true }, { message: '结束日期格式应为 YYYY-MM-DD' })
  endDate!: string;

  @Field(() => String, {
    nullable: true,
    description: '周期规则（如 BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0）',
  })
  @IsOptional()
  @IsString({ message: '周期规则必须是字符串' })
  recurrenceRule?: string | null;

  @Field(() => Int, { nullable: true, description: '请假有效阈值（小时）' })
  @IsOptional()
  @IsInt({ message: '请假阈值必须是整数' })
  @Min(0, { message: '请假阈值不能为负数' })
  @Max(168, { message: '请假阈值不能超过 168 小时' })
  leaveCutoffHours?: number;

  @Field(() => Float, { nullable: true, description: '每节客户价' })
  pricePerSession?: number | null;

  @Field(() => Float, { nullable: true, description: '每节授课参考价' })
  teachingFeeRef?: number | null;

  @Field(() => Int, { nullable: true, description: '最大报名学员数' })
  @IsOptional()
  @IsInt({ message: '最大报名人数必须是整数' })
  @Min(0, { message: '最大报名人数不能为负数' })
  maxLearners?: number;

  @Field(() => String, { nullable: true, description: '备注' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(512, { message: '备注长度不能超过 512 个字符' })
  remark?: string | null;
}
