// src/types/models/auth.types.ts

import { AudienceTypeEnum, IdentityTypeEnum, LoginTypeEnum } from './account.types';

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
}
