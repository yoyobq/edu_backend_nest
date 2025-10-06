// src/cats/dto/cat.dto.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { CatStatus } from '../entities/cat.entity';

/**
 * Cat 数据传输对象
 * 用于 GraphQL 查询和变更操作的返回结果
 */
@ObjectType()
export class CatObject {
  @Field(() => Number, { description: 'Cat 的唯一标识符' })
  id!: number;

  @Field(() => String, { nullable: true, description: 'Cat 的名称' })
  name?: string;

  @Field(() => CatStatus, { description: 'Cat 的状态' })
  status!: CatStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
