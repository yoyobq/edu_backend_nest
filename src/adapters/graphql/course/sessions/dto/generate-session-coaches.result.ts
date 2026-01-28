// 文件位置：src/adapters/graphql/course/sessions/dto/generate-session-coaches.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '批量生成节次教练关联的结果' })
export class GenerateSessionCoachesForSeriesResultGql {
  @Field(() => Int, { description: '开课班 ID' })
  seriesId!: number;

  @Field(() => Int, { description: '参与处理的节次数量' })
  sessionsProcessed!: number;

  @Field(() => Int, { description: '规划或确认的节次-教练关联数量' })
  coachRelationsPlanned!: number;
}
