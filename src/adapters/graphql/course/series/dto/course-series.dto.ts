// 文件位置：src/adapters/graphql/course/series/dto/course-series.dto.ts
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 课程系列对外暴露的最大结构 DTO
 * 用于 GraphQL 输出，限制适配层对外的字段范围与描述
 */
@ObjectType({ description: '课程系列信息' })
export class CourseSeriesDTO {
  @Field(() => ID, { description: '课程系列 ID' })
  id!: number;

  @Field(() => ID, { description: '课程目录 ID' })
  catalogId!: number;

  @Field(() => String, { description: '系列标题' })
  title!: string;

  @Field(() => String, { description: '系列描述', nullable: true })
  description!: string | null;

  @Field(() => VenueType, { description: '上课地点类型' })
  venueType!: VenueType;

  @Field(() => ClassMode, { description: '班型' })
  classMode!: ClassMode;

  @Field(() => String, { description: '开班起始日期 (YYYY-MM-DD)' })
  startDate!: string;

  @Field(() => String, { description: '开班结束日期 (YYYY-MM-DD)' })
  endDate!: string;

  @Field(() => String, { description: '周期规则', nullable: true })
  recurrenceRule!: string | null;

  @Field(() => Number, { description: '请假有效阈值（小时）' })
  leaveCutoffHours!: number;

  @Field(() => String, { description: '每节客户价（字符串承载 decimal）', nullable: true })
  pricePerSession!: string | null;

  @Field(() => String, { description: '每节授课参考价（字符串承载 decimal）', nullable: true })
  teachingFeeRef!: string | null;

  @Field(() => Number, { description: '最大报名学员数' })
  maxLearners!: number;

  @Field(() => CourseSeriesStatus, { description: '系列状态' })
  status!: CourseSeriesStatus;

  @Field(() => String, { description: '系列备注（Manager 可见）', nullable: true })
  remark!: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => ID, { description: '创建者账号 ID', nullable: true })
  createdBy!: number | null;

  @Field(() => ID, { description: '更新者账号 ID', nullable: true })
  updatedBy!: number | null;
}
