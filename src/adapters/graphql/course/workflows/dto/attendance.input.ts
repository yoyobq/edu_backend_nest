// 文件位置：src/adapters/graphql/course/workflows/dto/attendance.input.ts
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * 批量记录节次出勤 GraphQL 输入项（单条）
 */
@InputType()
export class AttendanceRecordItemInputGql {
  @Field(() => Int)
  @IsInt()
  enrollmentId!: number;

  @Field(() => String)
  @IsEnum(ParticipationAttendanceStatus)
  status!: ParticipationAttendanceStatus;

  @Field(() => String)
  @IsString()
  @Matches(/^\d+(?:\.\d{1,2})?$/)
  countApplied!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(255)
  remark?: string | null;
}

/**
 * 批量记录节次出勤 GraphQL 输入
 */
@InputType()
export class RecordSessionAttendanceInputGql {
  @Field(() => Int)
  @IsInt()
  sessionId!: number;

  @Field(() => [AttendanceRecordItemInputGql])
  items!: AttendanceRecordItemInputGql[];
}

/**
 * 按 seriesId 查询未终审 attendance 列表 GraphQL 输入
 */
@InputType()
export class ListUnfinalizedAttendanceBySeriesInputGql {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  seriesId!: number;
}

/**
 * 批量记录节次出勤 GraphQL 输出结果
 */
@ObjectType()
export class RecordSessionAttendanceResultGql {
  @Field(() => Int)
  updatedCount!: number;

  @Field(() => Int)
  unchangedCount!: number;
}

/**
 * 终审节次出勤 GraphQL 输入
 */
@InputType()
export class FinalizeSessionAttendanceInputGql {
  @Field(() => Int)
  @IsInt()
  sessionId!: number;
}

/**
 * 终审节次出勤 GraphQL 输出
 */
@ObjectType()
export class FinalizeSessionAttendanceResultGql {
  @Field(() => Int)
  updatedCount!: number;
}
