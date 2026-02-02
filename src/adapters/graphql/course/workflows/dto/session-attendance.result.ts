// 文件位置：src/adapters/graphql/course/workflows/dto/session-attendance.result.ts
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { Gender } from '@app-types/models/user-info.types';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

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

  @Field(() => ParticipationEnrollmentStatus)
  enrollmentStatus!: ParticipationEnrollmentStatus;

  @Field(() => ParticipationEnrollmentStatusReason, { nullable: true })
  enrollmentStatusReason!: ParticipationEnrollmentStatusReason | null;
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
export class UnfinalizedAttendanceSeriesGql {
  @Field(() => Int)
  catalogId!: number;

  @Field(() => String)
  catalogTitle!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  startDate!: string;

  @Field(() => String)
  endDate!: string;

  @Field(() => String, { nullable: true })
  leadCoachName!: string | null;

  @Field(() => CourseSeriesStatus)
  status!: CourseSeriesStatus;
}

@ObjectType()
export class FinalizedAttendanceSeriesGql {
  @Field(() => Int)
  catalogId!: number;

  @Field(() => String)
  catalogTitle!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  startDate!: string;

  @Field(() => String)
  endDate!: string;

  @Field(() => String, { nullable: true })
  leadCoachName!: string | null;

  @Field(() => CourseSeriesStatus)
  status!: CourseSeriesStatus;
}

/**
 * 未终审出勤记录 GraphQL 输出类型
 */
@ObjectType()
export class UnfinalizedAttendanceRecordGql {
  @Field(() => Int)
  attendanceId!: number;

  @Field(() => Int)
  sessionId!: number;

  @Field(() => Date)
  sessionStartTime!: Date;

  @Field(() => Int)
  enrollmentId!: number;

  @Field(() => Int)
  learnerId!: number;

  @Field(() => String)
  learnerName!: string;

  @Field(() => String)
  status!: string;

  @Field(() => String)
  countApplied!: string;

  @Field(() => Int, { nullable: true })
  confirmedByCoachId!: number | null;

  @Field(() => String, { nullable: true })
  confirmedByCoachName!: string | null;

  @Field(() => Date, { nullable: true })
  confirmedAt!: Date | null;

  @Field(() => String, { nullable: true })
  remark!: string | null;
}

/**
 * 已终审出勤记录 GraphQL 输出类型
 */
@ObjectType()
export class FinalizedAttendanceRecordGql {
  @Field(() => Int)
  attendanceId!: number;

  @Field(() => Int)
  sessionId!: number;

  @Field(() => Date)
  sessionStartTime!: Date;

  @Field(() => Int)
  enrollmentId!: number;

  @Field(() => Int)
  learnerId!: number;

  @Field(() => String)
  learnerName!: string;

  @Field(() => String)
  status!: string;

  @Field(() => String)
  countApplied!: string;

  @Field(() => Int, { nullable: true })
  confirmedByCoachId!: number | null;

  @Field(() => String, { nullable: true })
  confirmedByCoachName!: string | null;

  @Field(() => Date, { nullable: true })
  confirmedAt!: Date | null;

  @Field(() => String, { nullable: true })
  remark!: string | null;
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

/**
 * 节次出勤明细行 GraphQL 输出类型
 */
@ObjectType()
export class SessionAttendanceDetailItemGql {
  @Field(() => Int)
  enrollmentId!: number;

  @Field(() => Int)
  learnerId!: number;

  @Field(() => String)
  learnerName!: string;

  @Field(() => Gender)
  gender!: Gender;

  @Field(() => Int, { nullable: true })
  age!: number | null;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { nullable: true })
  specialNeeds!: string | null;

  @Field(() => String)
  attendanceStatus!: string;

  @Field(() => String)
  countApplied!: string;

  @Field(() => ParticipationEnrollmentStatus)
  enrollmentStatus!: ParticipationEnrollmentStatus;

  @Field(() => ParticipationEnrollmentStatusReason, { nullable: true })
  enrollmentStatusReason!: ParticipationEnrollmentStatusReason | null;

  @Field(() => Int)
  customerId!: number;

  @Field(() => String)
  customerName!: string;

  @Field(() => String, { nullable: true })
  customerPhone!: string | null;

  @Field(() => Float)
  customerRemainingSessions!: number;
}

/**
 * 节次出勤明细 GraphQL 输出类型
 */
@ObjectType()
export class SessionAttendanceDetailGql {
  @Field(() => Int)
  sessionId!: number;

  @Field(() => [SessionAttendanceDetailItemGql])
  items!: SessionAttendanceDetailItemGql[];
}
