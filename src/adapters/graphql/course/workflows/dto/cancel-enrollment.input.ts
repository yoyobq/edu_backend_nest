// src/adapters/graphql/course/workflows/dto/cancel-enrollment.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * 取消报名的 GraphQL 输入
 * 适配器层将输入映射为 usecase 参数结构。
 */
@InputType()
export class CancelEnrollmentInputGql {
  /** 报名 ID（可选；当提供 enrollmentId 时优先使用） */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly enrollmentId?: number;

  /** 节次 ID（可选；与 learnerId 搭配定位报名） */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly sessionId?: number;

  /** 学员 ID（可选；与 sessionId 搭配定位报名） */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly learnerId?: number;

  /** 取消原因，可选 */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(255)
  readonly reason?: string | null;
}

// 文件末尾保留换行
