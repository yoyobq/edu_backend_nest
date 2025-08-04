// src/types/services/register.types.ts

import { RegisterInput } from '../../modules/register/dto/register.input';
import { AccountStatus } from '../models/account.types';

/**
 * 注册类型枚举
 */
export enum RegisterTypeEnum {
  /** 学生 */
  STUDENT = 'STUDENT',
  /** 教职工 */
  STAFF = 'STAFF',
  /** 注册用户 */
  REGISTRANT = 'REGISTRANT',
  // 以下是设计用户，但无法在注册时直接认定
  // /** 管理用户 */
  // MANAGER = 'MANAGER',
  // /** 客户 */
  // CUSTOMER = 'CUSTOMER',
  // /** 学员 */
  // LEARNER = 'LEARNER',
  // /** 教练 */
  // COACH = 'COACH',
}

/**
 * 准备好的注册数据类型
 * 用于 TypeORM 创建账户实体的数据结构
 */
export type PreparedRegisterData = Omit<RegisterInput, 'confirmPassword' | 'type'> & {
  /** 账户状态 */
  status: AccountStatus;
  /** 用户昵称 */
  nickname: string;
  /** 邮箱地址 */
  email: string;
  /** 访问权限组 */
  accessGroup: string[];
  /** 身份提示 */
  identityHint: string;
  /** 私有字段 */
  metaDigest: string | string[];
};
