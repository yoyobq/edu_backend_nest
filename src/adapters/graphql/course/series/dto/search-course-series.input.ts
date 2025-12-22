// src/adapters/graphql/course/series/dto/search-course-series.input.ts
import { ClassMode, CourseSeriesStatus } from '@app-types/models/course-series.types';
import { Field, InputType } from '@nestjs/graphql';
import { PaginationArgs, SortInput } from '@src/adapters/graphql/pagination.args';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

  @Field(() => Boolean, { nullable: true, description: '是否仅包含有效系列（默认 false）' })
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
