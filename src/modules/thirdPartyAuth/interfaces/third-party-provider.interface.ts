// src/modules/thirdPartyAuth/interfaces/third-party-provider.interface.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '../../../types/models/account.types';

/**
 * 第三方会话信息
 * 统一封装不同第三方平台返回的用户身份数据
 */
export type ThirdPartySession = {
  /** 第三方平台用户唯一标识 (如微信 openid、OAuth sub、用户 id) */
  providerUserId: string;
  /** 联合 ID，用于跨应用识别同一用户 (可选) */
  unionId?: string | null;
  /** 用户基本信息 (可选) */
  profile?: {
    /** 用户昵称 */
    nickname?: string | null;
    /** 用户邮箱 */
    email?: string | null;
    /** 用户头像 URL */
    avatarUrl?: string | null;
  };
  /** 微信小程序会话密钥原始值 (仅 WeApp 使用，上层仅存摘要) */
  sessionKeyRaw?: string;
  /** OIDC ID Token 的 header.payload 部分 (可选，用于审计) */
  idTokenHeaderPayload?: string;
};

/**
 * 第三方认证提供者接口
 * 定义统一的第三方平台认证规范
 */
export interface ThirdPartyProvider {
  /** 第三方平台类型标识 */
  readonly provider: ThirdPartyProviderEnum;

  /**
   * 交换第三方凭证获取用户身份信息
   * 统一接口：将不同平台的认证凭证转换为标准化的用户会话信息
   * @param params 交换参数
   * @param params.credential 第三方凭证 (如 OAuth code、id_token、access_token)
   * @param params.audience 客户端类型 (用于区分不同应用场景)
   * @returns 标准化的第三方会话信息
   * @throws HttpException 当凭证无效或网络请求失败时抛出异常
   */
  exchangeCredential({
    credential,
    audience,
  }: {
    credential: string;
    audience: AudienceTypeEnum;
  }): Promise<ThirdPartySession>;
}
