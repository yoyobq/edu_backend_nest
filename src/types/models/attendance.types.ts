// 文件位置：src/types/models/attendance.types.ts
/** 出勤状态枚举（与数据库枚举一致） */
export enum ParticipationAttendanceStatus {
  NO_SHOW = 'NO_SHOW',
  PRESENT = 'PRESENT',
  EXCUSED = 'EXCUSED',
  /** 未到但免扣（计次为 0.00） */
  NO_SHOW_WAIVED = 'NO_SHOW_WAIVED',
  LATE_CANCEL = 'LATE_CANCEL',
  CANCELLED = 'CANCELLED',
}
