// src/types/models/learner.types.ts

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
 * 排序方向枚举
 */
export enum SortOrder {
  /** 升序 */
  ASC = 'ASC',
  /** 降序 */
  DESC = 'DESC',
}
