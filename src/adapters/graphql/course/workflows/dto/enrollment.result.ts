// src/adapters/graphql/course/workflows/dto/enrollment.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 学员报名结果的 GraphQL 输出类型
 * 与 usecase 的输出模型对齐，仅暴露只读字段。
 */
@ObjectType()
export class EnrollmentOutputGql {
  @Field(() => Int)
  readonly id!: number;

  @Field(() => Int)
  readonly sessionId!: number;

  @Field(() => Int)
  readonly learnerId!: number;

  @Field(() => Int)
  readonly customerId!: number;

  @Field(() => Int)
  readonly isCanceled!: 0 | 1;

  @Field(() => String, { nullable: true })
  readonly remark!: string | null;
}

@ObjectType()
export class EnrollLearnerToSessionResultGql {
  @Field(() => EnrollmentOutputGql)
  readonly enrollment!: EnrollmentOutputGql;

  @Field(() => Boolean)
  readonly isNewlyCreated!: boolean;
}

/**
 * 学员已报名节次 ID 列表输出
 */
@ObjectType()
export class ListLearnerEnrolledSessionIdsBySeriesResultGql {
  @Field(() => [Int])
  readonly sessionIds!: number[];
}

/**
 * customer 在开课班中的预约状态输出
 */
@ObjectType()
export class HasCustomerEnrollmentBySeriesResultGql {
  @Field(() => Boolean)
  readonly hasEnrollment!: boolean;
}
