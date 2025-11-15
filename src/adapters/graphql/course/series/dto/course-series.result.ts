// 文件位置：src/adapters/graphql/course/series/dto/course-series.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
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
}
