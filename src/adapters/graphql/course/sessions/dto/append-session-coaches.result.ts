import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '追加单节次教练 roster 的结果' })
export class AppendSessionCoachesResultGql {
  @Field(() => Int, { description: '节次 ID' })
  sessionId!: number;

  @Field(() => Int, { description: '本次激活的教练记录数量（含新建/复活/更新）' })
  activatedCount!: number;
}
