// 文件位置：src/adapters/graphql/course/sessions/dto/sync-session-coaches-roster.input.ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

@InputType({ description: '同步单节次教练 roster 的输入参数' })
export class SyncSessionCoachesRosterInputGql {
  @Field(() => Int, { description: '节次 ID' })
  @IsInt({ message: '节次 ID 必须是整数' })
  @Min(1, { message: '节次 ID 必须大于 0' })
  sessionId!: number;

  @Field(() => [Int], {
    description: '目标教练 ID 列表（整体覆盖，不允许为空）',
  })
  @IsArray({ message: '教练 ID 列表必须是数组' })
  @ArrayMinSize(1, { message: '教练 ID 列表至少包含 1 个元素' })
  @IsInt({ each: true, message: '教练 ID 必须是整数' })
  coachIds!: number[];
}
