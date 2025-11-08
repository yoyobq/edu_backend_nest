// src/adapters/graphql/dto/coach/coaches.list.ts
import { Field, ObjectType } from '@nestjs/graphql';
import { CoachType } from '@src/adapters/graphql/account/dto/identity/coach.dto';
import { PaginationInfo } from '@src/adapters/graphql/identity-management/learner/dto/learners.list';

/**
 * GraphQL 输出：教练列表分页结果
 */
@ObjectType()
export class ListCoachesOutput {
  /** 教练列表（新字段，建议使用） */
  @Field(() => [CoachType], { description: '教练列表' })
  coaches!: CoachType[];

  /** 教练列表（兼容旧字段，后续可移除） */
  @Field(() => [CoachType], {
    description: '教练列表（兼容字段）',
    deprecationReason: '请改用 coaches 字段',
  })
  data!: CoachType[];

  @Field(() => PaginationInfo, { description: '分页信息' })
  pagination!: PaginationInfo;
}
