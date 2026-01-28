// 文件位置：src/adapters/graphql/course/sessions/dto/generate-session-coaches.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, Min } from 'class-validator';

@InputType({ description: '按开课班批量生成节次教练关联的输入参数' })
export class GenerateSessionCoachesForSeriesInputGql {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;

  @Field(() => Int, {
    nullable: true,
    description: '最大处理节次数量（可选，默认 200 ）',
  })
  @IsOptional()
  @IsInt({ message: '最大节次数量必须是整数' })
  @Min(1, { message: '最大节次数量必须大于 0' })
  maxSessions?: number;
}
