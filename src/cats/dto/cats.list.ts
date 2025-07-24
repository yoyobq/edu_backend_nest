// src/cats/dto/cats.list.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CatObject } from './cat.object';

/**
 * Cat 列表查询响应
 * 用于分页查询 Cat 的返回结果，包含数据列表和分页信息
 */
@ObjectType()
export class CatsListResponse {
  @Field(() => [CatObject], { description: 'Cat 列表' })
  cats!: CatObject[];

  @Field(() => Int, { description: '总数' })
  total!: number;

  @Field(() => Int, { description: '当前页码' })
  page!: number;

  @Field(() => Int, { description: '每页数量' })
  limit!: number;

  /**
   * 计算总页数
   * @returns 总页数
   */
  @Field(() => Int, { description: '总页数' })
  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  /**
   * 判断是否有下一页
   * @returns 是否有下一页
   */
  @Field(() => Boolean, { description: '是否有下一页' })
  get hasNextPage(): boolean {
    return this.page < this.totalPages;
  }

  /**
   * 判断是否有上一页
   * @returns 是否有上一页
   */
  @Field(() => Boolean, { description: '是否有上一页' })
  get hasPreviousPage(): boolean {
    return this.page > 1;
  }
}
