// 文件位置：/var/www/backend/src/types/models/participation-enrollment.types.ts
export enum ParticipationEnrollmentStatus {
  ENROLLED = 'ENROLLED',
  CANCELED = 'CANCELED',
  LEAVE = 'LEAVE',
}

export enum ParticipationEnrollmentStatusReason {
  ADMIN_CORRECTION = 'ADMIN_CORRECTION',
  ADMIN_FORCE_CANCEL = 'ADMIN_FORCE_CANCEL',
  CUSTOMER_REGRET = 'CUSTOMER_REGRET',
  SCHEDULE_CHANGED = 'SCHEDULE_CHANGED',
  SYSTEM_INVALID_ENROLLMENT = 'SYSTEM_INVALID_ENROLLMENT',
  LEAVE_SICK = 'LEAVE_SICK',
  LEAVE_PERSONAL = 'LEAVE_PERSONAL',
  LEAVE_OTHER = 'LEAVE_OTHER',
}
