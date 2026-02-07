// src/adapters/graphql/course/sessions/dto/list-sessions-by-series.result.ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  CourseSessionDTO,
  CourseSessionSafeViewDTO,
  CourseSessionWithSeriesDTO,
} from './course-session.dto';

/**
 * 按开课班读取节次列表结果
 */
@ObjectType({ description: '节次列表结果' })
export class CourseSessionsBySeriesResult {
  @Field(() => [CourseSessionDTO], { description: '节次列表' })
  items!: CourseSessionDTO[];
}

@ObjectType({ description: '节次列表结果（安全视图）' })
export class CustomerCourseSessionsBySeriesResult {
  @Field(() => [CourseSessionSafeViewDTO], { description: '节次列表' })
  items!: CourseSessionSafeViewDTO[];
}

@ObjectType({ description: '教练节次列表结果' })
export class CoachCourseSessionsResult {
  @Field(() => [CourseSessionWithSeriesDTO], { description: '节次列表' })
  items!: CourseSessionWithSeriesDTO[];
}

@ObjectType({ description: '节次教练信息' })
export class SessionCoachBriefDTO {
  @Field(() => ID, { description: '教练 ID' })
  id!: number;

  @Field(() => String, { description: '教练姓名' })
  name!: string;

  @Field(() => Int, { description: '教练等级' })
  level!: number;
}

@ObjectType({ description: '节次教练列表条目' })
export class SessionCoachBySeriesItemDTO {
  @Field(() => ID, { description: '节次 ID' })
  sessionId!: number;

  @Field(() => Date, { description: '开始时间' })
  startTime!: Date;

  @Field(() => Date, { description: '结束时间' })
  endTime!: Date;

  @Field(() => SessionCoachBriefDTO, { description: '主教练', nullable: true })
  leadCoach!: SessionCoachBriefDTO | null;

  @Field(() => [SessionCoachBriefDTO], { description: '副教练列表' })
  assistantCoaches!: SessionCoachBriefDTO[];
}

@ObjectType({ description: '节次教练列表结果' })
export class SessionCoachesBySeriesResult {
  @Field(() => [SessionCoachBySeriesItemDTO], { description: '节次教练列表' })
  items!: SessionCoachBySeriesItemDTO[];
}
