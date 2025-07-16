// src/modules/account/constants/provider-tokens.ts

/**
 * Profile Provider 相关的注入令牌
 */
export const PROFILE_PROVIDERS_TOKEN = 'PROFILE_PROVIDERS';
export const PROFILE_PROVIDER_MAP_TOKEN = 'PROFILE_PROVIDER_MAP';

/**
 * 支持的身份类型常量
 */
export const SUPPORTED_IDENTITIES = {
  STUDENT: 'student',
  STAFF: 'staff',
} as const;

export type SupportedIdentity = (typeof SUPPORTED_IDENTITIES)[keyof typeof SUPPORTED_IDENTITIES];
