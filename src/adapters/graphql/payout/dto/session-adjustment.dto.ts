// 文件位置：src/adapters/graphql/payout/dto/session-adjustment.dto.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 课次调整记录 GraphQL 输出类型
 */
@ObjectType({ description: '课次调整记录' })
export class PayoutSessionAdjustmentType {
  @Field(() => Int, { description: '记录 ID' })
  id!: number;

  @Field(() => Int, { description: '客户 ID' })
  customerId!: number;

  @Field(() => String, { description: '本次课次变动数（字符串，保留两位小数）' })
  deltaSessions!: string;

  @Field(() => String, { description: '变动前剩余课次快照（字符串，两位小数）' })
  beforeSessions!: string;

  @Field(() => String, { description: '变动后剩余课次快照（字符串，两位小数）' })
  afterSessions!: string;

  @Field(() => String, { description: '调整原因类型（字符串）' })
  reasonType!: string;

  @Field(() => String, { nullable: true, description: '原因备注' })
  reasonNote!: string | null;

  @Field(() => Int, { nullable: true, description: '操作者账号 ID' })
  operatorAccountId!: number | null;

  @Field(() => String, { nullable: true, description: '关联订单号（可选）' })
  orderRef!: string | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;
}
