// src/adapters/graphql/course/workflows/dto/cancel-enrollment.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 取消报名结果的 GraphQL 输出类型
 * 与 usecase 的输出模型对齐，仅暴露只读字段。
 */
@ObjectType()
export class CancelEnrollmentOutputGql {
  @Field(() => Int)
  readonly id!: number;

  @Field(() => Int)
  readonly sessionId!: number;

  @Field(() => Int)
  readonly learnerId!: number;

  @Field(() => Int)
  readonly customerId!: number;

  @Field(() => Int)
  readonly isCanceled!: 0 | 1;

  @Field(() => String, { nullable: true })
  readonly cancelReason!: string | null;
}

@ObjectType()
export class CancelEnrollmentResultGql {
  @Field(() => CancelEnrollmentOutputGql)
  readonly enrollment!: CancelEnrollmentOutputGql;

  @Field(() => Boolean)
  readonly isUpdated!: boolean;
}

// 文件末尾保留换行
