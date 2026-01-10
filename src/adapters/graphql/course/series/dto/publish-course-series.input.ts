// src/adapters/graphql/course/series/dto/publish-course-series.input.ts
import { Type } from 'class-transformer';
import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 应用开课班排期 入参 DTO
 * 与 Usecase 的 ApplySeriesScheduleInput 对齐
 */
@InputType()
export class PublishCustomCourseSessionInput {
  @Field(() => Date, { description: '节次开始时间' })
  @IsDate({ message: '节次开始时间必须是 Date 类型' })
  startTime!: Date;

  @Field(() => Date, { description: '节次结束时间' })
  @IsDate({ message: '节次结束时间必须是 Date 类型' })
  endTime!: Date;

  @Field(() => String, { nullable: true, description: '上课地点文本（默认 馆内）' })
  @IsOptional()
  @IsString({ message: '上课地点必须是字符串' })
  @MaxLength(64, { message: '上课地点长度不能超过 64 个字符' })
  locationText?: string;

  @Field(() => String, { nullable: true, description: '备注（可选）' })
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  @MaxLength(200, { message: '备注长度不能超过 200 个字符' })
  remark?: string | null;
}

@InputType()
export class ApplyCourseSeriesScheduleInput {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;

  @Field(() => [String], {
    nullable: true,
    description: '选择发布的 occurrenceKey 列表（省略表示全量）',
  })
  @IsOptional()
  selectedKeys?: string[];

  @Field(() => String, { description: '预览哈希（防篡改校验）' })
  @IsString({ message: '预览哈希必须是字符串' })
  @MaxLength(128, { message: '预览哈希长度过长' })
  previewHash!: string;

  @Field(() => Boolean, { nullable: true, description: '是否为试发布（不写库）' })
  @IsOptional()
  dryRun?: boolean;

  @Field(() => [PublishCustomCourseSessionInput], {
    nullable: true,
    description: '自定义临时课次列表（不受 recurrenceRule 限制）',
  })
  @IsOptional()
  @IsArray({ message: '自定义临时课次必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => PublishCustomCourseSessionInput)
  customSessions?: PublishCustomCourseSessionInput[];

  @Field(() => Int, {
    nullable: true,
    description: '主教练 ID（manager/admin 必须提供；coach 忽略）',
  })
  @IsOptional()
  @IsInt({ message: '主教练 ID 必须是整数' })
  @Min(1, { message: '主教练 ID 必须大于 0' })
  leadCoachId?: number;
}

@InputType()
export class PublishCourseSeriesInput {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;
}
