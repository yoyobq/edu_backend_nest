// src/adapters/graphql/identity-management/coach/dto/coach.result.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { CoachType } from '@src/adapters/graphql/account/dto/identity/coach.dto';

/**
 * 更新教练信息的 GraphQL 结果
 */
@ObjectType()
export class UpdateCoachResult {
  @Field(() => CoachType, { description: '教练信息' })
  coach!: CoachType;
}

/**
 * 下线教练的 GraphQL 结果
 */
@ObjectType()
export class DeactivateCoachResult {
  @Field(() => CoachType, { description: '教练信息' })
  coach!: CoachType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}

/**
 * 上线教练的 GraphQL 结果
 */
@ObjectType()
export class ReactivateCoachResult {
  @Field(() => CoachType, { description: '教练信息' })
  coach!: CoachType;

  @Field(() => Boolean, { description: '是否发生状态变更（幂等为 false）' })
  isUpdated!: boolean;
}
