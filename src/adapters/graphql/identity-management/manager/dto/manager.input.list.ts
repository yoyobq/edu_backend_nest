// src/adapters/graphql/identity-management/manager/dto/manager.input.list.ts

import { Field, InputType } from '@nestjs/graphql';
import { IsOptional } from 'class-validator';

/**
 * GraphQL 输入：经理列表查询入参
 */
@InputType()
export class ListManagersInput {
  /** 是否包含已下线数据（默认不包含） */
  @Field(() => Boolean, { nullable: true, description: '是否包含已下线数据', defaultValue: false })
  @IsOptional()
  includeDeleted?: boolean = false;
}
