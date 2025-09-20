// src/types/models/auth.types.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from './account.types';
import { MinimalUserInfo } from '../auth/login-flow.types';

/**
 * 用户信息模型接口
 */
export interface UserInfoModel {
  id: number;
  accountId: number;
  nickname: string;
  gender: string;
  birthDate: string | null;
  avatarUrl: string | null;
  email: string | null;
  signature: string | null;
  accessGroup: IdentityTypeEnum[];
  address: string | null;
  phone: string | null;
  tags: string[] | null;
  geographic: string | null;
  notifyCount: number;
  unreadCount: number;
  userState: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 登录输入参数领域模型
 */
export interface AuthLoginModel {
  loginName: string;
  loginPassword: string;
  type: LoginTypeEnum;
  ip?: string;
  audience: AudienceTypeEnum;
}

/**
 * 身份信息领域模型
 */
export interface IdentityModel {
  role: IdentityTypeEnum;
}

/**
 * 登录结果领域模型
 */
export interface LoginResultModel {
  accessToken: string;
  refreshToken: string;
  accountId: number;
  role: IdentityTypeEnum;
  identity?: unknown; // 简化为 unknown，由适配器层处理
  userInfo?: MinimalUserInfo | null; // 修改：使用 MinimalUserInfo 而不是 UserInfoModel
}
