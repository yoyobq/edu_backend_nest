// src/adapters/graphql/pagination.args.ts
// GraphQL 入参 DTO，仅做适配，不进行副作用注册
// GraphQL 入参 DTO：使用已注册的枚举类型

import { Field, InputType, Int } from '@nestjs/graphql';
import { GqlPaginationMode, GqlSortDirection } from './pagination.enums';

@InputType()
export class SortInput {
  @Field()
  field!: string;

  @Field(() => GqlSortDirection)
  direction!: GqlSortDirection; // 显式 GraphQL Enum
}

@InputType()
export class PaginationArgs {
  @Field(() => GqlPaginationMode)
  mode!: GqlPaginationMode;

  @Field(() => Int, { nullable: true })
  page?: number;

  @Field(() => Int, { nullable: true })
  pageSize?: number;

  @Field(() => Int, { nullable: true })
  limit?: number;

  @Field({ nullable: true })
  after?: string;

  @Field(() => [SortInput], { nullable: true })
  sorts?: SortInput[];

  @Field({ nullable: true })
  withTotal?: boolean;
}
