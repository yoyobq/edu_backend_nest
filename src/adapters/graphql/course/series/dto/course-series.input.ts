// 文件位置：src/adapters/graphql/course/series/dto/course-series.input.ts
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { PaginationArgs, SortInput } from '@src/adapters/graphql/pagination.args';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

@InputType()
export class PreviewSeriesScheduleInput {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;

  @Field(() => Boolean, { nullable: true, description: '是否启用冲突检测（默认 true）' })
  enableConflictCheck?: boolean;
}

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

@InputType({ description: '搜索与分页开课班输入' })
export class SearchCourseSeriesInputGql {
  @Field(() => String, { nullable: true, description: '文本搜索：按标题模糊匹配' })
  @IsOptional()
  @IsString({ message: 'query 必须是字符串' })
  @MaxLength(120, { message: 'query 长度不能超过 120 个字符' })
  query?: string;

  @Field(() => PaginationArgs, { description: '分页参数（支持 OFFSET/CURSOR）' })
  @ValidateNested()
  @Type(() => PaginationArgs)
  pagination!: PaginationArgs;

  @Field(() => [SortInput], {
    nullable: true,
    description: '排序字段列表（如 startDate/createdAt/id）',
  })
  @IsOptional()
  sorts?: SortInput[];

  @Field(() => Boolean, { nullable: true, description: '是否仅包含有效系列（默认 true）' })
  @IsOptional()
  @IsBoolean({ message: 'activeOnly 必须是布尔值' })
  activeOnly?: boolean;

  @Field(() => [CourseSeriesStatus], {
    nullable: true,
    description: '状态过滤（若传入则覆盖 activeOnly）',
  })
  @IsOptional()
  @IsEnum(CourseSeriesStatus, { each: true, message: '开课班状态无效' })
  statuses?: CourseSeriesStatus[];

  @Field(() => ClassMode, { nullable: true, description: '班型过滤' })
  @IsOptional()
  @IsEnum(ClassMode, { message: '班型类型无效' })
  classMode?: ClassMode;

  @Field(() => String, { nullable: true, description: '开班起始日期下限 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'startDateFrom 格式应为 YYYY-MM-DD' })
  startDateFrom?: string;

  @Field(() => String, { nullable: true, description: '开班起始日期上限 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'startDateTo 格式应为 YYYY-MM-DD' })
  startDateTo?: string;

  @Field(() => String, { nullable: true, description: '开班结束日期下限 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'endDateFrom 格式应为 YYYY-MM-DD' })
  endDateFrom?: string;

  @Field(() => String, { nullable: true, description: '开班结束日期上限 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'endDateTo 格式应为 YYYY-MM-DD' })
  endDateTo?: string;
}
