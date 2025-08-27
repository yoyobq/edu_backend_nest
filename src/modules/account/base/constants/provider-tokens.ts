// src/modules/account/base/constants/provider-tokens.ts

/**
 * 对外暴露的“聚合 Map” token
 * - AccountModule 会把各身份的 provider 聚合成 Map<identity, provider>
 * - 上层模块只需注入这个 Map 使用，避免依赖内部实现细节
 */
export const PROFILE_PROVIDER_MAP_TOKEN = 'PROFILE_PROVIDER_MAP';

/**
 * 为每个身份定义“唯一的 Provider token”
 * - 各身份模块用这里对应的 token 注册自己的 provider
 * - AccountModule.forRoot(...) 会按启用的身份动态注入这些 token，并聚合成 Map
 * - 用 Symbol 避免命名冲突
 */
export const PROFILE_PROVIDER_TOKEN = {
  STAFF: Symbol('PROFILE_PROVIDER:STAFF'),
  STUDENT: Symbol('PROFILE_PROVIDER:STUDENT'),
  COACH: Symbol('PROFILE_PROVIDER:COACH'),
  MANAGER: Symbol('PROFILE_PROVIDER:MANAGER'),
  CUSTOMER: Symbol('PROFILE_PROVIDER:CUSTOMER'),
  LEARNER: Symbol('PROFILE_PROVIDER:LEARNER'),
} as const;

/**
 * 支持的身份常量（大写，便于与 DB/枚举统一）
 * - 仅作语义对齐和类型推导使用
 */
export const SUPPORTED_IDENTITIES = {
  STUDENT: 'STUDENT',
  STAFF: 'STAFF',
  MANAGER: 'MANAGER',
  COACH: 'COACH',
  CUSTOMER: 'CUSTOMER',
  LEARNER: 'LEARNER',
  REGISTRANT: 'REGISTRANT',
} as const;

/** 派生类型：'STUDENT' | 'STAFF' | ... */
export type SupportedIdentity = (typeof SUPPORTED_IDENTITIES)[keyof typeof SUPPORTED_IDENTITIES];
