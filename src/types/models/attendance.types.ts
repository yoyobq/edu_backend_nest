// 文件位置：src/types/models/attendance.types.ts
/** 出勤状态枚举（与数据库枚举一致） */
export enum ParticipationAttendanceStatus {
  NO_SHOW = 'NO_SHOW',
  PRESENT = 'PRESENT',
  EXCUSED = 'EXCUSED',
  LATE_CANCEL = 'LATE_CANCEL',
  CANCELLED = 'CANCELLED',
}
