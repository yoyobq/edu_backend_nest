// 文件位置：/var/www/backend/src/adapters/graphql/course/workflows/dto/cancel-series-enrollment.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * 取消开课班报名的 GraphQL 输入
 * - 语义：对同一开课班（series）下的报名做批量取消
 */
@InputType()
export class CancelSeriesEnrollmentInputGql {
  /** 开课班 ID */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  readonly seriesId!: number;

  /** 学员 ID */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  readonly learnerId!: number;

  /** 取消原因（可选） */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  readonly reason?: string;
}
