// 文件位置：src/adapters/graphql/course/workflows/dto/session-attendance.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 节次点名行 GraphQL 输出类型
 */
@ObjectType()
export class AttendanceSheetRowGql {
  @Field(() => Int)
  enrollmentId!: number;

  @Field(() => Int)
  learnerId!: number;

  @Field(() => String)
  status!: string;

  @Field(() => String)
  countApplied!: string;

  @Field(() => Int, { nullable: true })
  confirmedByCoachId!: number | null;

  @Field(() => Date, { nullable: true })
  confirmedAt!: Date | null;

  @Field(() => Boolean)
  finalized!: boolean;

  @Field(() => Int)
  isCanceled!: 0 | 1;
}

/**
 * 节次点名视图 GraphQL 输出类型
 */
@ObjectType()
export class AttendanceSheetGql {
  @Field(() => Int)
  sessionId!: number;

  @Field(() => Boolean)
  isFinalized!: boolean;

  @Field(() => [AttendanceSheetRowGql])
  rows!: AttendanceSheetRowGql[];
}

@ObjectType()
export class SessionLeaveRequestRowGql {
  @Field(() => Int)
  enrollmentId!: number;

  @Field(() => Int)
  learnerId!: number;

  @Field(() => String)
  learnerName!: string;

  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field(() => Date, { nullable: true })
  confirmedAt!: Date | null;
}

@ObjectType()
export class SessionLeaveRequestListGql {
  @Field(() => Int)
  sessionId!: number;

  @Field(() => [SessionLeaveRequestRowGql])
  items!: SessionLeaveRequestRowGql[];
}
