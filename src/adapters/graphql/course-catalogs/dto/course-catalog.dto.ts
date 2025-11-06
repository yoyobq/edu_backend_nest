// src/adapters/graphql/course-catalogs/dto/course-catalog.dto.ts
import { CourseLevel } from '@app-types/models/course.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 课程目录数据传输对象
 */
@ObjectType({ description: '课程目录信息' })
export class CourseCatalogDTO {
  @Field(() => ID, { description: '课程目录 ID' })
  id!: number;

  @Field(() => CourseLevel, { description: '课程等级' })
  courseLevel!: CourseLevel;

  @Field(() => String, { description: '课程目录标题' })
  title!: string;

  @Field(() => String, { description: '课程目录描述', nullable: true })
  description?: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt?: Date | null;

  @Field(() => ID, { description: '创建者 ID', nullable: true })
  createdBy?: number | null;

  @Field(() => ID, { description: '更新者 ID', nullable: true })
  updatedBy?: number | null;
}
