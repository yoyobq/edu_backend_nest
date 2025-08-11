// src/modules/thirdPartyAuth/interfaces/third-party-provider.interface.ts
import { ThirdPartyProviderEnum } from '../../../types/models/account.types';
import { ThirdPartyLoginInput } from '../dto/third-party-login.input';

/**
 * 第三方登录结果接口
 */
export interface ThirdPartyLoginResult {
  success: boolean;
  isNewUser: boolean;
  provider: ThirdPartyProviderEnum;
  providerUserId: string;
  unionId?: string;
  sessionKey?: string;
  nextStep?: 'REGISTRATION_REQUIRED';
  message?: string;
  account?: {
    id: number;
    loginName: string;
    loginEmail: string;
    accessGroup: string[];
  };
  suggestedUserInfo?: {
    nickname: string;
    avatar: string;
  };
}

/**
 * 第三方登录提供者接口
 */
export interface ThirdPartyProvider {
  /**
   * 执行第三方登录
   * @param input 登录参数
   * @returns 登录结果
   */
  login(input: ThirdPartyLoginInput): Promise<ThirdPartyLoginResult>;
}
