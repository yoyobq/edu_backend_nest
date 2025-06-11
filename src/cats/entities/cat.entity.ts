import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class Cat {
  @Field(() => Int, { description: 'Cat 的唯一标识符' })
  id!: number;

  @Field(() => Int, { description: 'Example field (placeholder)' })
  exampleField!: number;

  @Field({ description: 'Cat 的名称', nullable: true })
  name?: string;

  @Field({ description: '创建时间', nullable: true })
  createdAt?: Date;

  @Field({ description: '更新时间', nullable: true })
  updatedAt?: Date;
}
