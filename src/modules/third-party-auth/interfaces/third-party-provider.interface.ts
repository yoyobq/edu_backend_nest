// src/modules/thirdPartyAuth/interfaces/third-party-provider.interface.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { ThirdPartySession } from '@app-types/models/third-party-auth.types';

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
