// src/types/services/prepared-register-data.type.ts

import { RegisterInput } from '../../modules/register/dto/register.input';
import { AccountStatus } from '../models/account.types';

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
  email?: string;

  /** 访问权限组 */
  accessGroup: string[];

  /** 身份提示 */
  hint: string;
};
