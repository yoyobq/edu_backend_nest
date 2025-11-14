// src/adapters/graphql/course/workflows/dto/cancel-enrollment.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 取消报名的 GraphQL 输入
 * 适配器层将输入映射为 usecase 参数结构。
 */
@InputType()
export class CancelEnrollmentInputGql {
  /** 报名 ID */
  @Field(() => Int)
  @IsInt()
  readonly enrollmentId!: number;

  /** 取消原因，可选 */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(255)
  readonly reason?: string | null;
}

// 文件末尾保留换行
