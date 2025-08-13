// src/modules/thirdPartyAuth/providers/wechat.provider.ts
import { Injectable } from '@nestjs/common';
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '../../../types/models/account.types';
import { ThirdPartySession } from '../../../types/models/third-party-auth.types';
import { ThirdPartyProvider } from '../interfaces/third-party-provider.interface';

/**
 * 微信网页/公众号认证提供者
 * 用于实现微信网页授权和公众号 OAuth 认证流程
 * TODO: 实现完整的网页/公众号 OAuth 认证流程
 */
@Injectable()
export class WechatProvider implements ThirdPartyProvider {
  readonly provider = ThirdPartyProviderEnum.WECHAT;

  /**
   * 微信网页/公众号 OAuth 认证凭证交换
   * TODO: 实现 code → access_token → userinfo 的完整 OAuth 流程
   * @param params 交换参数
   * @param params.credential 微信网页授权获取的 code
   * @param params.audience 客户端类型
   * @returns 标准化的第三方会话信息
   * @throws Error 当前未实现，抛出占位错误
   */
  exchangeCredential({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    credential,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    audience,
  }: {
    credential: string;
    audience: AudienceTypeEnum;
  }): Promise<ThirdPartySession> {
    // TODO: 实现微信网页/公众号 OAuth 的 code→access_token→userinfo 流程
    throw new Error('WECHAT_WEB_NOT_IMPLEMENTED');
  }
}
