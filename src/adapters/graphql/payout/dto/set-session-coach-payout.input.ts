// src/adapters/graphql/payout/dto/set-session-coach-payout.input.ts
import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType({ description: '设置节次教练课酬的输入' })
export class SetSessionCoachPayoutInputGql {
  @Field(() => Int, { description: '节次 ID' })
  sessionId!: number;

  @Field(() => Int, { description: '教练身份 ID' })
  coachId!: number;

  @Field(() => Float, {
    nullable: true,
    description: '教学课酬金额（元），可选；不传则不修改',
  })
  teachingFeeAmount?: number;

  @Field(() => Float, {
    nullable: true,
    description: '奖金金额（元），可选；不传则不修改',
  })
  bonusAmount?: number;

  @Field(() => String, {
    nullable: true,
    description: '课酬备注，可选；传 null 表示清空',
  })
  payoutNote?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: '课酬最终确认时间，可选；传 null 表示清空',
  })
  payoutFinalizedAt?: Date | null;
}
