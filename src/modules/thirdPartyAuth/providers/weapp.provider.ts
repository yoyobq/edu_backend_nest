// src/modules/thirdPartyAuth/providers/weapp.provider.ts
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceTypeEnum, ThirdPartyProviderEnum } from '../../../types/models/account.types';
import {
  ThirdPartyProvider,
  ThirdPartySession,
} from '../interfaces/third-party-provider.interface';

/** 微信小程序 code2session 接口成功响应 */
interface WeAppCode2SessionSuccess {
  /** 用户唯一标识 */
  openid: string;
  /** 会话密钥 */
  session_key: string;
  /** 用户在微信开放平台的唯一标识 (可选) */
  unionid?: string;
}

/** 微信小程序 code2session 接口错误响应 */
interface WeAppCode2SessionError {
  /** 错误码 */
  errcode: number;
  /** 错误信息 */
  errmsg: string;
}

/** 微信小程序 code2session 接口响应联合类型 */
type WeAppCode2SessionResponse = WeAppCode2SessionSuccess | WeAppCode2SessionError;

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
   * @param params.credential 微信小程序前端获取的 js_code
   * @param params.audience 客户端类型
   * @returns 标准化的第三方会话信息
   * @throws HttpException 当配置缺失、凭证无效或 API 调用失败时抛出异常
   */
  async exchangeCredential({
    credential,
    audience,
  }: {
    credential: string;
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
      js_code: credential,
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
}
