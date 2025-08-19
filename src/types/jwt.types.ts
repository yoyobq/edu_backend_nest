// src/types/jwt.types.ts

/**
 * 生成访问令牌的参数类型
 */
export type GenerateAccessTokenParams = {
  payload: JwtPayload;
  expiresIn?: string;
};

/**
 * 生成刷新令牌的参数类型
 */
export type GenerateRefreshTokenParams = {
  payload: Pick<JwtPayload, 'sub'>;
  tokenVersion?: number;
};

/**
 * JWT Payload 类型定义
 */
export type JwtPayload = {
  // 自定义字段
  sub: number; // 用户 ID
  username: string; // 用户昵称（来自 UserInfoEntity.nickname）
  email: string; // 邮箱
  accessGroup: string[]; // 角色或分组
  type?: 'access' | 'refresh';
  tokenVersion?: number; // Refresh 控制用
  // 自动管理字段
  iat?: number; // 签发时间
  exp?: number; // 过期时间
  iss?: string; // 签发者
  aud?: string; // 受众
};
