// src/cats/dto/create-cat.output.ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { CatStatus } from '../entities/cat.entity';

/**
 * 创建 Cat 的输出 DTO
 * 用于 createCat mutation 的返回结果
 */
@ObjectType()
export class CreateCatOutput {
  @Field(() => ID, { description: 'Cat 的唯一标识符' })
  id!: number;

  @Field(() => String, { nullable: true, description: 'Cat 的名称' })
  name?: string;

  @Field(() => CatStatus, { description: 'Cat 的状态' })
  status!: CatStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;
}
