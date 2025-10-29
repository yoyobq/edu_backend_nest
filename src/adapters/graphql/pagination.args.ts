// src/adapters/graphql/pagination.args.ts
// GraphQL 入参 DTO，仅做适配，不进行副作用注册

import type { SortDirection } from '@core/pagination/pagination.types';
import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class SortInput {
  @Field()
  field!: string;

  @Field()
  direction!: SortDirection;
}

@InputType()
export class PaginationArgs {
  @Field()
  mode!: 'OFFSET' | 'CURSOR';

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
