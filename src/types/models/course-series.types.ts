// src/types/models/course-series.types.ts

/**
 * 开课班枚举类型定义
 * 与数据库表 `course_series` 的枚举列保持一致
 */
export enum PublisherType {
  /** 管理员 */
  MANAGER = 'MANAGER',
  /** 教练 */
  COACH = 'COACH',
}

/**
 * 上课地点类型
 */
export enum VenueType {
  /** 散打馆 */
  SANDA_GYM = 'SANDA_GYM',
  /** 田径场 */
  TRACK_FIELD = 'TRACK_FIELD',
  /** 客户家（上门） */
  CUSTOMER_HOME = 'CUSTOMER_HOME',
}

/**
 * 班型
 */
export enum ClassMode {
  /** 小班课 */
  SMALL_CLASS = 'SMALL_CLASS',
  /** 大班课 */
  LARGE_CLASS = 'LARGE_CLASS',
}

/**
 * 班级状态
 */
export enum CourseSeriesStatus {
  /** 已建班但未发布 */
  PLANNED = 'PLANNED',
  /** 待审批 */
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  /** 正在招生/进行中 */
  PUBLISHED = 'PUBLISHED',
  /** 招生已满或已封班 */
  CLOSED = 'CLOSED',
  /** 已结课 */
  FINISHED = 'FINISHED',
}
