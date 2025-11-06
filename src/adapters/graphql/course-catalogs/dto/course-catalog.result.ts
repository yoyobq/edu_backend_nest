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

/**
 * 下线课程目录返回结果
 */
@ObjectType({ description: '下线课程目录结果' })
export class DeactivateCatalogResult {
  /** 更新后的课程目录实体 */
  @Field(() => CourseCatalogDTO, { description: '更新后的课程目录实体' })
  catalog!: CourseCatalogDTO;

  /** 是否发生状态变更（幂等时为 false） */
  @Field(() => Boolean, { description: '是否发生状态变更（幂等时为 false）' })
  isUpdated!: boolean;
}

/**
 * 重新激活课程目录返回结果
 */
@ObjectType({ description: '重新激活课程目录结果' })
export class ReactivateCatalogResult {
  /** 更新后的课程目录实体 */
  @Field(() => CourseCatalogDTO, { description: '更新后的课程目录实体' })
  catalog!: CourseCatalogDTO;

  /** 是否发生状态变更（幂等时为 false） */
  @Field(() => Boolean, { description: '是否发生状态变更（幂等时为 false）' })
  isUpdated!: boolean;
}
