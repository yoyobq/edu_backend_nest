// src/adapters/graphql/course/catalogs/dto/course-catalog.input.ts
// 迁移自 src/adapters/graphql/course-catalogs/dto/course-catalog.input.ts
import { CourseLevel } from '@app-types/models/course.types';
import { Field, ID, InputType } from '@nestjs/graphql';
import { PaginationArgs } from '@src/adapters/graphql/pagination.args';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 根据课程等级查询课程目录输入参数
 */
@InputType({ description: '根据课程等级查询课程目录' })
export class GetCatalogByLevelInput {
  @Field(() => CourseLevel, { description: '课程等级' })
  @IsEnum(CourseLevel, { message: '课程等级无效' })
  courseLevel!: CourseLevel;
}

/**
 * 分页搜索课程目录输入参数
 * 承载统一分页参数与可选的文本检索关键词
 */
@InputType({ description: '分页搜索课程目录输入参数' })
export class SearchCourseCatalogsInput {
  @Field(() => PaginationArgs, { description: '分页与排序参数' })
  pagination!: PaginationArgs;

  @Field(() => String, { description: '全文检索关键词', nullable: true })
  query?: string;
}

/**
 * 更新课程目录详情输入参数
 */
@InputType({ description: '更新课程目录详情' })
export class UpdateCatalogDetailsInput {
  @Field(() => ID, { description: '课程目录 ID' })
  @Type(() => Number)
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;

  @Field(() => String, { description: '课程目录标题', nullable: true })
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(100, { message: '标题长度不能超过 100 个字符' })
  title?: string;

  @Field(() => String, { description: '课程目录描述', nullable: true })
  @IsOptional()
  @IsString({ message: '描述必须是字符串' })
  @MaxLength(512, { message: '描述长度不能超过 512 个字符' })
  description?: string;
}

/**
 * 下线课程目录输入参数
 */
@InputType({ description: '下线课程目录输入参数' })
export class DeactivateCatalogInput {
  /** 课程目录 ID */
  @Field(() => ID, { description: '课程目录 ID' })
  @Type(() => Number)
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;
}

/**
 * 重新激活课程目录输入参数
 */
@InputType({ description: '重新激活课程目录输入参数' })
export class ReactivateCatalogInput {
  /** 课程目录 ID */
  @Field(() => ID, { description: '课程目录 ID' })
  @Type(() => Number)
  @IsInt({ message: 'ID 必须是整数' })
  id!: number;
}

/**
 * 创建课程目录输入参数
 */
@InputType({ description: '创建课程目录输入参数' })
export class CreateCatalogInput {
  /** 课程等级（唯一约束） */
  @Field(() => CourseLevel, { description: '课程等级（唯一约束）' })
  @IsEnum(CourseLevel, { message: '课程等级无效' })
  courseLevel!: CourseLevel;

  /** 标题（必填） */
  @Field(() => String, { description: '课程目录标题' })
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(100, { message: '标题长度不能超过 100 个字符' })
  title!: string;

  /** 描述（可选） */
  @Field(() => String, { description: '课程目录描述', nullable: true })
  @IsOptional()
  @IsString({ message: '描述必须是字符串' })
  @MaxLength(512, { message: '描述长度不能超过 512 个字符' })
  description?: string | null;
}
