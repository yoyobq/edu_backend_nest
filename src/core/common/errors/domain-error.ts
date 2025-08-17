// src/core/common/errors/domain-error.ts
// 领域错误与错误码：跨层共享的核心错误定义

/**
 * 领域错误类
 * 用于表示业务逻辑层的错误，可在 Service、Usecase 和 Adapter 层之间传递
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(code: string, message: string, details?: unknown, cause?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.cause = cause;

    // 兼容某些编译目标/测试环境的原型链问题，确保 instanceof 正常
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainError);
    }
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

// 认证相关错误码（登录/刷新/鉴权）
export const AUTH_ERROR = {
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_BANNED: 'ACCOUNT_BANNED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_AUDIENCE: 'INVALID_AUDIENCE',
} as const;
Object.freeze(AUTH_ERROR);

// 账户领域错误码（账户资料/唯一性约束等）
export const ACCOUNT_ERROR = {
  ACCOUNT_ALREADY_EXISTS: 'ACCOUNT_ALREADY_EXISTS',
  NICKNAME_ALREADY_EXISTS: 'NICKNAME_ALREADY_EXISTS',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  OPERATION_NOT_SUPPORTED: 'OPERATION_NOT_SUPPORTED',
  ACCOUNT_NOT_FOUND: AUTH_ERROR.ACCOUNT_NOT_FOUND, // 复用同一码值，避免前端分裂
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  USER_INFO_NOT_FOUND: 'USER_INFO_NOT_FOUND',
} as const;
Object.freeze(ACCOUNT_ERROR);

// 第三方认证相关错误码
export const THIRDPARTY_ERROR = {
  CREDENTIAL_INVALID: 'THIRDPARTY_CREDENTIAL_INVALID',
  ACCOUNT_NOT_BOUND: 'THIRDPARTY_ACCOUNT_NOT_BOUND',
  LOGIN_FAILED: 'THIRDPARTY_LOGIN_FAILED',
  BIND_FAILED: 'THIRDPARTY_BIND_FAILED',
  UNBIND_FAILED: 'THIRDPARTY_UNBIND_FAILED',
  PROVIDER_NOT_SUPPORTED: 'THIRDPARTY_PROVIDER_NOT_SUPPORTED',
  ACCOUNT_ALREADY_BOUND: 'THIRDPARTY_ACCOUNT_ALREADY_BOUND',
} as const;
Object.freeze(THIRDPARTY_ERROR);

// 类型辅助
export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR];
export type AccountErrorCode = (typeof ACCOUNT_ERROR)[keyof typeof ACCOUNT_ERROR];
export type ThirdPartyErrorCode = (typeof THIRDPARTY_ERROR)[keyof typeof THIRDPARTY_ERROR];

// 类型守卫：统一判断是否为领域错误（兼容多包/反序列化场景）
export const isDomainError = (error: unknown): error is DomainError => {
  if (error instanceof DomainError) return true;
  if (!error || typeof error !== 'object') return false;
  const anyE = error as { name?: unknown; code?: unknown };
  return anyE?.name === 'DomainError' && typeof anyE?.code === 'string';
};
