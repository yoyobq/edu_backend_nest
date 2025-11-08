// src/adapters/graphql/identity-management/manager/dto/manager.result.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { ManagerType } from '@src/adapters/graphql/account/dto/identity/manager.dto';

/**
 * 更新经理信息的 GraphQL 结果
 */
@ObjectType()
export class UpdateManagerResult {
  @Field(() => ManagerType, { description: '经理信息' })
  manager!: ManagerType;
}

/**
 * 下线经理的 GraphQL 结果
 */
@ObjectType()
export class DeactivateManagerResult {
  @Field(() => ManagerType, { description: '经理信息' })
  manager!: ManagerType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}

/**
 * 上线经理的 GraphQL 结果
 */
@ObjectType()
export class ReactivateManagerResult {
  @Field(() => ManagerType, { description: '经理信息' })
  manager!: ManagerType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}
