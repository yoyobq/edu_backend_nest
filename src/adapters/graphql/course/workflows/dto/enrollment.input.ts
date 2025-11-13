// src/adapters/graphql/course/workflows/dto/enrollment.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 学员报名到节次的 GraphQL 输入
 * 定义供适配层传参的结构，统一由 Resolver 派发到 usecase。
 */
@InputType()
export class EnrollLearnerToSessionInputGql {
  /** 节次 ID */
  @Field(() => Int)
  @IsInt()
  readonly sessionId!: number;

  /** 学员 ID */
  @Field(() => Int)
  @IsInt()
  readonly learnerId!: number;

  /** 备注，可选 */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(255)
  readonly remark?: string | null;
}
