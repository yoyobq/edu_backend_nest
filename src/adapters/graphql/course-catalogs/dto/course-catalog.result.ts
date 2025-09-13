// src/adapters/graphql/course-catalogs/dto/course-catalog.result.ts

import { Field, ObjectType } from '@nestjs/graphql';
import { CourseCatalogDTO } from './course-catalog.dto';

/**
 * 更新课程目录详情返回结果
 */
@ObjectType({ description: '更新课程目录详情结果' })
export class UpdateCatalogDetailsResult {
  /**
   * 操作是否成功
   */
  @Field(() => Boolean, { description: '操作是否成功' })
  success!: boolean;

  /**
   * 更新后的课程目录数据
   * 成功时返回更新后的数据，失败时为 null
   */
  @Field(() => CourseCatalogDTO, { nullable: true, description: '更新后的课程目录数据' })
  data?: CourseCatalogDTO | null;

  /**
   * 错误信息
   * 失败时返回具体的错误信息
   */
  @Field(() => String, { nullable: true, description: '错误信息' })
  message?: string | null;
}

/**
 * 课程目录列表返回结果
 */
@ObjectType({ description: '课程目录列表' })
export class CourseCatalogsListResult {
  /**
   * 课程目录列表
   */
  @Field(() => [CourseCatalogDTO], { description: '课程目录列表' })
  items!: CourseCatalogDTO[];
}
