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
export class EnrollmentDetailOutputGql {
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

  @Field(() => String, { nullable: true })
  readonly cancelReason!: string | null;
}

@ObjectType()
export class EnrollLearnerToSessionResultGql {
  @Field(() => EnrollmentOutputGql)
  readonly enrollment!: EnrollmentOutputGql;

  @Field(() => Boolean)
  readonly isNewlyCreated!: boolean;
}

/**
 * 批量报名开课班失败明细
 */
@ObjectType()
export class EnrollLearnerToSeriesFailedItemGql {
  @Field(() => Int)
  readonly sessionId!: number;

  @Field(() => String)
  readonly code!: string;

  @Field(() => String)
  readonly message!: string;
}

/**
 * 学员报名到开课班结果输出
 */
@ObjectType()
export class EnrollLearnerToSeriesResultGql {
  @Field(() => [Int])
  readonly createdEnrollmentIds!: number[];

  @Field(() => [Int])
  readonly restoredEnrollmentIds!: number[];

  @Field(() => [Int])
  readonly unchangedEnrollmentIds!: number[];

  @Field(() => [EnrollLearnerToSeriesFailedItemGql])
  readonly failed!: EnrollLearnerToSeriesFailedItemGql[];
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
 * 当前账号已报名开课班 ID 列表输出
 */
@ObjectType()
export class ListCurrentAccountEnrolledSeriesIdsResultGql {
  @Field(() => [Int])
  readonly seriesIds!: number[];
}

/**
 * 当前账号已报名节次 ID 列表输出
 */
@ObjectType()
export class CurrentAccountEnrolledSessionItemGql {
  @Field(() => Int)
  readonly sessionId!: number;

  @Field(() => Int)
  readonly learnerId!: number;

  @Field(() => String)
  readonly learnerName!: string;
}

@ObjectType()
export class ListCurrentAccountEnrolledSessionsResultGql {
  @Field(() => [Int])
  readonly sessionIds!: number[];

  @Field(() => [CurrentAccountEnrolledSessionItemGql])
  readonly enrollments!: CurrentAccountEnrolledSessionItemGql[];
}

/**
 * 学员是否存在已报名的开课班输出
 */
@ObjectType()
export class HasLearnerEnrollmentResultGql {
  @Field(() => Boolean)
  readonly hasEnrollment!: boolean;
}

/**
 * customer 在开课班中的预约状态输出
 */
@ObjectType()
export class HasCustomerEnrollmentBySeriesResultGql {
  @Field(() => Boolean)
  readonly hasEnrollment!: boolean;
}
