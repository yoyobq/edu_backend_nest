// src/adapters/graphql/course/sessions/dto/list-sessions-by-series.input.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';

/**
 * 按开课班读取节次列表的输入参数
 */
@InputType()
export class ListSessionsBySeriesInput {
  @Field(() => Int, { description: '开课班 ID' })
  @IsInt({ message: '开课班 ID 必须是整数' })
  @Min(1, { message: '开课班 ID 必须大于 0' })
  seriesId!: number;

  @Field(() => String, {
    nullable: true,
    description: '读取模式：RECENT_WINDOW 或 ALL（默认 RECENT_WINDOW）',
  })
  @IsOptional()
  @IsIn(['RECENT_WINDOW', 'ALL'], { message: '读取模式无效' })
  mode?: 'RECENT_WINDOW' | 'ALL';

  @Field(() => Date, { nullable: true, description: '基准时间（仅 RECENT_WINDOW 生效）' })
  @IsOptional()
  @IsDate({ message: '基准时间必须是 Date 类型' })
  baseTime?: Date;

  @Field(() => Int, { nullable: true, description: '过去侧最多返回条数（仅 RECENT_WINDOW 生效）' })
  @IsOptional()
  @IsInt({ message: '过去侧条数必须是整数' })
  @Min(0, { message: '过去侧条数不能为负数' })
  pastLimit?: number;

  @Field(() => Int, { nullable: true, description: '未来侧最多返回条数（仅 RECENT_WINDOW 生效）' })
  @IsOptional()
  @IsInt({ message: '未来侧条数必须是整数' })
  @Min(0, { message: '未来侧条数不能为负数' })
  futureLimit?: number;

  @Field(() => Int, { nullable: true, description: '最大返回条数（仅 ALL 生效，默认 200）' })
  @IsOptional()
  @IsInt({ message: '最大返回条数必须是整数' })
  @Min(0, { message: '最大返回条数不能为负数' })
  maxSessions?: number;

  @Field(() => [SessionStatus], { nullable: true, description: '可选：按节次状态筛选' })
  @IsOptional()
  @IsEnum(SessionStatus, { each: true, message: '状态筛选存在无效值' })
  statusFilter?: SessionStatus[];
}
