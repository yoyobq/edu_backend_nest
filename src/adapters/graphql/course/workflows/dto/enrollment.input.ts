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

/**
 * 用户请假 GraphQL 输入
 * 定义供适配层传参的结构，统一由 Resolver 派发到 usecase。
 */
@InputType()
export class RequestSessionLeaveInputGql {
  /** 节次 ID */
  @Field(() => Int)
  @IsInt()
  readonly sessionId!: number;

  /** 学员 ID */
  @Field(() => Int)
  @IsInt()
  readonly learnerId!: number;

  /** 请假原因，可选 */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(255)
  readonly reason?: string | null;
}

/**
 * 学员报名到开课班的 GraphQL 输入
 * 定义供适配层传参的结构，统一由 Resolver 派发到 usecase。
 */
@InputType()
export class EnrollLearnerToSeriesInputGql {
  /** 开课班 ID */
  @Field(() => Int)
  @IsInt()
  readonly seriesId!: number;

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

/**
 * 查询学员在指定开课班中的已报名节次 ID 列表输入
 */
@InputType()
export class ListLearnerEnrolledSessionIdsBySeriesInputGql {
  /** 开课班 ID */
  @Field(() => Int)
  @IsInt()
  readonly seriesId!: number;

  /** 学员 ID */
  @Field(() => Int)
  @IsInt()
  readonly learnerId!: number;
}

/**
 * 查询学员是否存在已报名的开课班输入
 */
@InputType()
export class HasLearnerEnrollmentInputGql {
  /** 学员 ID */
  @Field(() => Int)
  @IsInt()
  readonly learnerId!: number;
}

/**
 * 查询 customer 在指定开课班中的预约状态输入
 */
@InputType()
export class HasCustomerEnrollmentBySeriesInputGql {
  /** 开课班 ID */
  @Field(() => Int)
  @IsInt()
  readonly seriesId!: number;

  /** 客户 ID */
  @Field(() => Int)
  @IsInt()
  readonly customerId!: number;
}

/**
 * 查询节次报名列表输入
 */
@InputType()
export class ListSessionEnrollmentsInputGql {
  /** 节次 ID */
  @Field(() => Int)
  @IsInt()
  readonly sessionId!: number;
}
