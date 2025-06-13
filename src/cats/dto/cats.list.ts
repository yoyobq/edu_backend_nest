// src/cats/dto/cats.list.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Cat } from '../entities/cat.entity';

/**
 * Cat 列表查询响应
 */
@ObjectType()
export class CatsListResponse {
  @Field(() => [Cat], { description: 'Cat 列表' })
  cats!: Cat[];

  @Field(() => Int, { description: '总数' })
  total!: number;

  @Field(() => Int, { description: '当前页码' })
  page!: number;

  @Field(() => Int, { description: '每页数量' })
  limit!: number;

  @Field(() => Int, { description: '总页数' })
  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  @Field(() => Boolean, { description: '是否有下一页' })
  get hasNextPage(): boolean {
    return this.page < this.totalPages;
  }

  @Field(() => Boolean, { description: '是否有上一页' })
  get hasPreviousPage(): boolean {
    return this.page > 1;
  }
}
