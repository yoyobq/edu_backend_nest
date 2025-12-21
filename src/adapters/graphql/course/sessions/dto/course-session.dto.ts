// src/adapters/graphql/course/sessions/dto/course-session.dto.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '协助教练信息' })
export class ExtraCoachDTO {
  @Field(() => ID, { description: '教练 ID' })
  id!: number;

  @Field(() => String, { description: '教练姓名' })
  name!: string;

  @Field(() => String, { description: '教练等级文本' })
  level!: string;
}

@ObjectType({ description: '课程节次信息（管理端视图）' })
export class CourseSessionDTO {
  @Field(() => ID, { description: '节次 ID' })
  id!: number;

  @Field(() => ID, { description: '开课班 ID' })
  seriesId!: number;

  @Field(() => Date, { description: '开始时间' })
  startTime!: Date;

  @Field(() => Date, { description: '结束时间' })
  endTime!: Date;

  @Field(() => ID, { description: '主教练 ID' })
  leadCoachId!: number;

  @Field(() => String, { description: '地点文本' })
  locationText!: string;

  @Field(() => [ExtraCoachDTO], { description: '协助教练列表', nullable: true })
  extraCoaches?: ExtraCoachDTO[] | null;

  @Field(() => SessionStatus, { description: '节次状态' })
  status!: SessionStatus;

  @Field(() => String, { description: '备注', nullable: true })
  remark?: string | null;

  @Field(() => Date, { description: '出勤确认时间', nullable: true })
  attendanceConfirmedAt?: Date | null;

  @Field(() => ID, { description: '出勤确认人账号 ID', nullable: true })
  attendanceConfirmedBy?: number | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}

@ObjectType({ description: '课程节次信息（安全视图）' })
export class CourseSessionSafeViewDTO {
  @Field(() => ID, { description: '节次 ID' })
  id!: number;

  @Field(() => ID, { description: '开课班 ID' })
  seriesId!: number;

  @Field(() => Date, { description: '开始时间' })
  startTime!: Date;

  @Field(() => Date, { description: '结束时间' })
  endTime!: Date;

  @Field(() => ID, { description: '主教练 ID' })
  leadCoachId!: number;

  @Field(() => String, { description: '地点文本' })
  locationText!: string;

  @Field(() => [ExtraCoachDTO], { description: '协助教练列表', nullable: true })
  extraCoaches?: ExtraCoachDTO[] | null;

  @Field(() => SessionStatus, { description: '节次状态' })
  status!: SessionStatus;
}
