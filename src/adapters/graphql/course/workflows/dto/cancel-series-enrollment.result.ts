// 文件位置：/var/www/backend/src/adapters/graphql/course/workflows/dto/cancel-series-enrollment.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 批量取消开课班报名时的失败明细
 */
@ObjectType()
export class CancelSeriesEnrollmentFailedItemGql {
  @Field(() => Int)
  readonly enrollmentId!: number;

  @Field(() => String)
  readonly code!: string;

  @Field(() => String)
  readonly message!: string;
}

/**
 * 取消开课班报名结果的 GraphQL 输出类型
 * - 返回已取消 / 未变更 / 失败明细，便于前端汇总展示
 */
@ObjectType()
export class CancelSeriesEnrollmentResultGql {
  @Field(() => [Int])
  readonly canceledEnrollmentIds!: number[];

  @Field(() => [Int])
  readonly unchangedEnrollmentIds!: number[];

  @Field(() => [CancelSeriesEnrollmentFailedItemGql])
  readonly failed!: CancelSeriesEnrollmentFailedItemGql[];
}
