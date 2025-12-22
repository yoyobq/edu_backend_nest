// src/adapters/graphql/course/series/dto/preview-series-schedule.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, Min } from 'class-validator';

@InputType()
export class PreviewSeriesScheduleInput {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;

  @Field(() => Boolean, { nullable: true, description: '是否启用冲突检测（默认 true）' })
  enableConflictCheck?: boolean;
}
