// src/types/models/course-session-coach.types.ts

/**
 * 节次教练移出原因枚举
 * 与数据库表 `course_session_coaches.removed_reason` 的枚举值保持一致
 */
export enum SessionCoachRemovedReason {
  REPLACED = 'REPLACED',
  TEMP_HELP = 'TEMP_HELP',
  NO_SHOW = 'NO_SHOW',
  OTHER = 'OTHER',
}
