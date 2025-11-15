// 文件位置：src/adapters/graphql/course/series/dto/course-series.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CourseSeriesStatus } from '@app-types/models/course-series.types';
import { CourseSeriesDTO } from './course-series.dto';

@ObjectType({ description: '预览的冲突信息' })
export class PreviewConflictDTO {
  @Field(() => Boolean, { description: '是否存在冲突' })
  hasConflict!: boolean;

  @Field(() => Int, { description: '冲突数量（为 0 表示无冲突）' })
  count!: number;
}

@ObjectType({ description: '预览生成的某次上课信息' })
export class PreviewOccurrenceDTO {
  @Field(() => Date, { description: '开始时间（ISO）' })
  startDateTime!: Date;

  @Field(() => Date, { description: '结束时间（ISO）' })
  endDateTime!: Date;

  @Field(() => String, { description: '日期（YYYY-MM-DD）' })
  date!: string;

  @Field(() => Int, { description: '星期索引（周一=1 ... 周日=7）' })
  weekdayIndex!: number;

  @Field(() => String, { description: '稳定键（YYYY-MM-DDTHH:mm#v1）' })
  occurrenceKey!: string;

  @Field(() => PreviewConflictDTO, {
    nullable: true,
    description: '冲突信息（未启用或无冲突为 null）',
  })
  conflict!: PreviewConflictDTO | null;
}

@ObjectType({ description: '课程系列排期预览结果' })
export class PreviewSeriesScheduleResultDTO {
  @Field(() => CourseSeriesDTO, { description: '目标课程系列' })
  series!: CourseSeriesDTO;

  @Field(() => [PreviewOccurrenceDTO], { description: '生成的上课场次列表' })
  occurrences!: PreviewOccurrenceDTO[];

  @Field(() => String, { description: '预览集合防篡改哈希（SHA-256）' })
  previewHash!: string;

  @Field(() => Int, {
    nullable: true,
    description: '默认主教练 ID（coach 请求时为当前 coach；manager/admin 请求时为空）',
  })
  defaultLeadCoachId!: number | null;
}

@ObjectType({ description: '发布课程系列结果' })
export class PublishSeriesResultDTO {
  @Field(() => Int, { description: '课程系列 ID' })
  seriesId!: number;

  @Field(() => CourseSeriesStatus, { description: '发布后系列状态（或 dryRun 原状态）' })
  status!: CourseSeriesStatus;

  @Field(() => String, { nullable: true, description: '发布时间（ISO），dryRun 为 null' })
  publishedAt!: string | null;

  @Field(() => Int, { description: '创建的节次数量（dryRun 为 0）' })
  createdSessions!: number;
}
