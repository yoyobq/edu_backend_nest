// src/types/common/sort.types.ts

/**
 * 排序方向枚举
 * 通用的排序方向定义，避免与数据库层面的 "sortOrder" 混用
 */
export enum OrderDirection {
  /** 升序 */
  ASC = 'ASC',
  /** 降序 */
  DESC = 'DESC',
}

/**
 * 学员排序字段枚举
 */
export enum LearnerSortField {
  /** 按创建时间排序 */
  CREATED_AT = 'createdAt',
  /** 按更新时间排序 */
  UPDATED_AT = 'updatedAt',
  /** 按学员姓名排序 */
  NAME = 'name',
  /** 按出生日期排序 */
  BIRTH_DATE = 'birthDate',
}

/**
 * 客户排序字段枚举
 */
export enum CustomerSortField {
  /** 按创建时间排序 */
  CREATED_AT = 'createdAt',
  /** 按更新时间排序 */
  UPDATED_AT = 'updatedAt',
  /** 按客户姓名排序 */
  NAME = 'name',
}

/**
 * 教练排序字段枚举
 */
export enum CoachSortField {
  /** 按创建时间排序 */
  CREATED_AT = 'createdAt',
  /** 按更新时间排序 */
  UPDATED_AT = 'updatedAt',
  /** 按教练姓名排序 */
  NAME = 'name',
}

/**
 * 经理排序字段枚举
 */
export enum ManagerSortField {
  /** 按创建时间排序 */
  CREATED_AT = 'createdAt',
  /** 按更新时间排序 */
  UPDATED_AT = 'updatedAt',
  /** 按姓名排序 */
  NAME = 'name',
}
