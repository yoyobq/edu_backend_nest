// src/types/models/third-party-auth.types.ts

/**
 * 第三方会话信息
 * 统一封装不同第三方平台返回的用户身份数据
 */
export type ThirdPartySession = {
  /** 第三方平台用户唯一标识 (如微信 openid、OAuth sub、用户 id) */
  providerUserId: string;
  /** 联合 ID，用于跨应用识别同一用户 (仅特定平台返回，如微信 unionid) */
  unionId: string | null;
  /** 用户基本信息 (仅特定平台返回，如 OAuth 用户信息接口) */
  profile?: {
    /** 用户昵称 */
    nickname?: string | null;
    /** 用户邮箱 */
    email?: string | null;
    /** 用户头像 URL */
    avatarUrl?: string | null;
  };
  /** 微信小程序会话密钥原始值 (仅 WeApp 平台返回，上层仅存摘要) */
  sessionKeyRaw?: string;
  /** OIDC ID Token 的 header.payload 部分 (仅 OIDC 平台返回，用于审计) */
  idTokenHeaderPayload?: string;
};

/**
 * 微信小程序 code2session 接口成功响应
 */
export interface WeAppCode2SessionSuccess {
  /** 用户唯一标识 */
  openid: string;
  /** 会话密钥 */
  session_key: string;
  /** 用户在微信开放平台的唯一标识 (可选) */
  unionid?: string;
}

/**
 * 微信小程序 code2session 接口错误响应
 */
export interface WeAppCode2SessionError {
  /** 错误码 */
  errcode: number;
  /** 错误信息 */
  errmsg: string;
}

/**
 * 微信小程序 code2session 接口响应联合类型
 */
export type WeAppCode2SessionResponse = WeAppCode2SessionSuccess | WeAppCode2SessionError;
