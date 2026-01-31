// src/adapters/graphql/course/workflows/dto/cancel-enrollment.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

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

  @Field(() => ParticipationEnrollmentStatus)
  readonly status!: ParticipationEnrollmentStatus;

  @Field(() => ParticipationEnrollmentStatusReason, { nullable: true })
  readonly statusReason!: ParticipationEnrollmentStatusReason | null;
}

@ObjectType()
export class CancelEnrollmentResultGql {
  @Field(() => CancelEnrollmentOutputGql)
  readonly enrollment!: CancelEnrollmentOutputGql;

  @Field(() => Boolean)
  readonly isUpdated!: boolean;
}

// 文件末尾保留换行
