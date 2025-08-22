// src/modules/third-party-auth/providers/weapp.provider.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import {
  PhoneNumberResult,
  ThirdPartySession,
  WeAppCode2SessionResponse,
  WeAppGetAccessTokenResponse,
  WeAppGetPhoneNumberResponse,
} from '@app-types/models/third-party-auth.types';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThirdPartyProvider } from '../interfaces/third-party-provider.interface';

/**
 * 微信小程序认证提供者
 * 实现微信小程序 js_code 换取 session_key 和 openid 的认证流程
 */
@Injectable()
export class WeAppProvider implements ThirdPartyProvider {
  readonly provider = ThirdPartyProviderEnum.WEAPP;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 根据客户端类型选择微信应用配置
   * 支持未来扩展：不同 audience 对应不同的小程序配置
   * @param params 选择参数
   * @param params.audience 客户端类型
   * @returns 微信应用配置 (appId 和 appSecret)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private pickApp({ audience }: { audience: AudienceTypeEnum }) {
    // TODO: 若将来一个 audience 对应不同的小程序，可在这里按 audience 选择 appId/secret
    return {
      appId: this.configService.get<string>('WECHAT_APP_ID'),
      appSecret: this.configService.get<string>('WECHAT_APP_SECRET'),
    };
  }

  /**
   * 微信小程序认证凭证交换
   * 使用 js_code 调用微信 code2session 接口获取用户身份信息
   * @param params 交换参数
   * @param params.authCredential 微信小程序前端获取的 js_code
   * @param params.audience 客户端类型
   * @returns 标准化的第三方会话信息
   * @throws HttpException 当配置缺失、凭证无效或 API 调用失败时抛出异常
   */
  async exchangeCredential({
    authCredential,
    audience,
  }: {
    authCredential: string;
    audience: AudienceTypeEnum;
  }): Promise<ThirdPartySession> {
    const { appId, appSecret } = this.pickApp({ audience });
    if (!appId || !appSecret) {
      throw new HttpException('微信应用配置缺失', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: appId,
      secret: appSecret,
      js_code: authCredential,
      grant_type: 'authorization_code',
    };

    try {
      const resp = await this.httpService.axiosRef.get<WeAppCode2SessionResponse>(url, {
        params,
        timeout: 10000,
      });
      const data = resp.data;

      // 检查微信 API 返回的错误码
      if ('errcode' in data) {
        const msg = data.errmsg ?? String(data.errcode);
        throw new HttpException(`微信授权失败: ${msg}`, HttpStatus.BAD_REQUEST);
      }

      // 类型守卫：确保返回数据的完整性
      if (!('openid' in data) || !data.openid || !data.session_key) {
        throw new HttpException('微信 API 返回数据不完整', HttpStatus.BAD_GATEWAY);
      }

      // 转换为统一的会话信息格式
      const session: ThirdPartySession = {
        providerUserId: data.openid,
        unionId: data.unionid ?? null,
        sessionKeyRaw: data.session_key,
      };
      return session;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('微信 API 调用失败', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * 获取微信小程序用户手机号
   * 使用 phoneCode 和 access_token 调用微信 getuserphonenumber 接口
   * @param params 获取参数
   * @param params.phoneCode 前端获取的手机号动态令牌
   * @param params.accessToken 接口调用凭证
   * @param params.audience 客户端类型
   * @returns 解密后的手机号信息
   * @throws HttpException 当配置缺失、令牌无效或 API 调用失败时抛出异常
   */
  async getPhoneNumber({
    phoneCode,
    accessToken,
    audience,
  }: {
    phoneCode: string;
    accessToken: string;
    audience: AudienceTypeEnum;
  }): Promise<PhoneNumberResult> {
    const { appId } = this.pickApp({ audience });
    if (!appId) {
      throw new HttpException('微信应用配置缺失', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    const requestBody = {
      code: phoneCode,
    };

    try {
      const resp = await this.httpService.axiosRef.post<WeAppGetPhoneNumberResponse>(
        url,
        requestBody,
        {
          timeout: 10000,
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': 'application/json',
          },
        },
      );
      const data = resp.data;

      // 检查微信 API 返回的错误码
      if ('errcode' in data && data.errcode !== 0) {
        const msg = data.errmsg ?? String(data.errcode);
        throw new HttpException(`微信获取手机号失败: ${msg}`, HttpStatus.BAD_REQUEST);
      }

      // 类型守卫：确保返回数据的完整性
      if (!('phone_info' in data) || !data.phone_info) {
        throw new HttpException('微信 API 返回数据不完整', HttpStatus.BAD_GATEWAY);
      }

      // 转换为统一的手机号信息格式
      const phoneResult: PhoneNumberResult = {
        phoneNumber: data.phone_info.phoneNumber,
        purePhoneNumber: data.phone_info.purePhoneNumber,
        countryCode: String(data.phone_info.countryCode), // 转换为字符串
      };
      return phoneResult;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('微信获取手机号 API 调用失败', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * 获取微信小程序 access_token
   * 使用 appId 和 appSecret 调用微信 getaccesstoken 接口
   * @param params 获取参数
   * @param params.audience 客户端类型
   * @returns 接口调用凭证
   * @throws HttpException 当配置缺失或 API 调用失败时抛出异常
   */
  async getAccessToken({ audience }: { audience: AudienceTypeEnum }): Promise<string> {
    const { appId, appSecret } = this.pickApp({ audience });
    if (!appId || !appSecret) {
      throw new HttpException('微信应用配置缺失', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = {
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
    };

    try {
      const resp = await this.httpService.axiosRef.get<WeAppGetAccessTokenResponse>(url, {
        params,
        timeout: 10000,
      });
      const data = resp.data;

      // 检查微信 API 返回的错误码
      if ('errcode' in data) {
        const msg = data.errmsg ?? String(data.errcode);
        throw new HttpException(`微信获取 access_token 失败: ${msg}`, HttpStatus.BAD_REQUEST);
      }

      // 类型守卫：确保返回数据的完整性
      if (!('access_token' in data) || !data.access_token) {
        throw new HttpException('微信 API 返回数据不完整', HttpStatus.BAD_GATEWAY);
      }

      console.log('微信获取 access_token 成功', data.access_token);
      return data.access_token;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('微信获取 access_token API 调用失败', HttpStatus.BAD_GATEWAY);
    }
  }
}
