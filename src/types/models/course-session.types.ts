// src/types/models/course-session.types.ts
/**
 * 节次状态枚举
 * 对应 DDL 中的 enum('SCHEDULED','CANCELED','FINISHED')
 */
export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  CANCELED = 'CANCELED',
  FINISHED = 'FINISHED',
}

/**
 * 协助教练信息结构
 * 用于 `extra_coaches_json` 存储前端展示所需的最小信息
 */
export interface ExtraCoachInfo {
  /** 教练 ID（引用 member_coach.id；不建外键） */
  id: number;
  /** 教练姓名（缓存前端展示用） */
  name: string;
  /** 教练等级（如 高级、金牌等，文本） */
  level: string;
}
