// src/modules/thirdPartyAuth/providers/weapp.provider.ts
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** WeApp code2session 成功返回 */
interface WeAppCode2SessionSuccess {
  openid: string;
  session_key: string;
  unionid?: string;
}

/** WeApp code2session 失败返回 */
interface WeAppCode2SessionError {
  errcode: number;
  errmsg: string;
}

/** WeApp code2session 响应联合类型 */
type WeAppCode2SessionResponse = WeAppCode2SessionSuccess | WeAppCode2SessionError;

/** 对外暴露给 Service 的会话结构 */
export interface WeAppSession {
  session_key: string;
  openid: string;
  unionid?: string;
}

/**
 * 微信小程序认证提供者
 * 负责与微信 API 交互，将授权码换取用户会话信息
 */
@Injectable()
export class WeAppProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 使用微信小程序授权码换取会话信息
   * @param code 微信小程序 wx.login() 返回的授权码
   * @returns 包含 openid、session_key 和可选 unionid 的会话信息
   * @throws HttpException 当配置缺失、授权码无效或微信 API 调用失败时
   */
  async exchangeCodeForSession(code: string): Promise<WeAppSession> {
    const appId = this.configService.get<string>('WECHAT_APP_ID');
    const appSecret = this.configService.get<string>('WECHAT_APP_SECRET');

    if (!appId || !appSecret) {
      throw new HttpException('微信应用配置缺失', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: appId,
      secret: appSecret,
      js_code: code,
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

      // 验证必要字段是否存在
      if (!data.openid || !data.session_key) {
        throw new HttpException('微信 API 返回数据不完整', HttpStatus.BAD_GATEWAY);
      }

      const result: WeAppSession = {
        openid: data.openid,
        session_key: data.session_key,
        unionid: data.unionid,
      };
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('微信 API 调用失败', HttpStatus.BAD_GATEWAY);
    }
  }
}
