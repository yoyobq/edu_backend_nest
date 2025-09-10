// /var/www/backend/src/adapters/graphql/course-catalogs/dto/course-catalog.input.ts
import { CourseLevel } from '@app-types/models/course.types';
import { Field, ID, InputType } from '@nestjs/graphql';
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
