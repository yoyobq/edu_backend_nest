// src/adapters/graphql/course/series/dto/publish-course-series.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 发布开课班 入参 DTO
 * 与 Usecase 的 PublishSeriesInput 对齐
 */
@InputType()
export class PublishCourseSeriesInput {
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

  @Field(() => Int, {
    nullable: true,
    description: '主教练 ID（manager/admin 必须提供；coach 忽略）',
  })
  @IsOptional()
  @IsInt({ message: '主教练 ID 必须是整数' })
  @Min(1, { message: '主教练 ID 必须大于 0' })
  leadCoachId?: number;
}
