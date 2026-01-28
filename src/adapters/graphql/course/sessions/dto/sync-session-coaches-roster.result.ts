// 文件位置：src/adapters/graphql/course/sessions/dto/sync-session-coaches-roster.result.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '同步单节次教练 roster 的结果' })
export class SyncSessionCoachesRosterResultGql {
  @Field(() => Int, { description: '节次 ID' })
  sessionId!: number;

  @Field(() => Int, { description: '本次激活的教练记录数量（含新建/复活/更新）' })
  activatedCount!: number;

  @Field(() => Int, { description: '本次标记移出的教练记录数量' })
  removedCount!: number;
}
