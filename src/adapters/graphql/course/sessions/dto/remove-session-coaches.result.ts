import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '移除单节次副教练的结果' })
export class RemoveSessionCoachesResultGql {
  @Field(() => Int, { description: '节次 ID' })
  sessionId!: number;

  @Field(() => Int, { description: '本次移除的教练记录数量' })
  removedCount!: number;
}
