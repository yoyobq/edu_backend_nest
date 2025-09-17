// src/types/jwt.types.ts

import { AudienceTypeEnum } from './models/account.types';

/**
 * 生成访问令牌的参数类型
 */
export type GenerateAccessTokenParams = {
  payload: JwtPayload;
  expiresIn?: string;
  audience?: AudienceTypeEnum; // 更明确的类型，使用枚举而非字符串
};

/**
 * 生成刷新令牌的参数类型
 */
export type GenerateRefreshTokenParams = {
  payload: Pick<JwtPayload, 'sub'>;
  tokenVersion?: number;
  audience?: AudienceTypeEnum; // 更明确的类型，使用枚举而非字符串
};

/**
 * JWT Payload 类型定义
 */
export type JwtPayload = {
  // 自定义字段
  sub: number; // 用户 ID
  username: string; // 用户昵称（来自 UserInfoEntity.nickname）
  email: string | null; // 邮箱，允许为空
  accessGroup: string[]; // 角色或分组
  type?: 'access' | 'refresh';
  tokenVersion?: number; // Refresh 控制用
  // 自动管理字段
  iat?: number; // 签发时间
  exp?: number; // 过期时间
  iss?: string; // 签发者
  aud?: string; // 受众 (audience)，对应 JWT 标准的 audience 声明，用于标识 token 的预期接收者
};
