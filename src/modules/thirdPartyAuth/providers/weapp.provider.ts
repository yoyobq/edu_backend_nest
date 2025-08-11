// src/modules/thirdPartyAuth/providers/weapp.provider.ts

import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThirdPartyProviderEnum } from '../../../types/models/account.types';
import { AccountService } from '../../account/account.service';
import { ThirdPartyAuthEntity } from '../../account/entities/third-party-auth.entity';
import { ThirdPartyLoginInput } from '../dto/third-party-login.input';
import {
  ThirdPartyLoginResult,
  ThirdPartyProvider,
} from '../interfaces/third-party-provider.interface';

/**
 * 微信小程序登录返回结果接口
 */
interface WeAppLoginResult {
  /** 会话密钥 */
  session_key: string;
  /** 用户唯一标识 */
  openid: string;
  unionid?: string;
  errmsg?: string;
  errcode?: number;
}

/**
 * 微信用户信息响应接口
 */
interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信小程序登录提供者
 */
@Injectable()
export class WeAppProvider implements ThirdPartyProvider {
  constructor(
    @InjectRepository(ThirdPartyAuthEntity)
    private readonly thirdPartyAuthRepository: Repository<ThirdPartyAuthEntity>,
    private readonly accountService: AccountService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 微信小程序登录处理
   * @param input 登录参数
   * @returns 微信用户信息和账户绑定状态
   */
  async login(input: ThirdPartyLoginInput): Promise<ThirdPartyLoginResult> {
    // 1. 通过授权码获取 openId
    const wechatSession = await this.getWechatOpenId(input.authCredential);

    // 2. 通过 openId 查找是否已有绑定的第三方认证记录
    const existingAuth = await this.findAccountByThirdParty(
      ThirdPartyProviderEnum.WECHAT,
      wechatSession.openid,
    );

    // 3. 如果找到了绑定记录，说明用户已注册，执行登录流程
    if (existingAuth && existingAuth.account) {
      // 3.1 获取完整的账户信息
      const accountWithAccessGroup = await this.accountService.getUserWithAccessGroup({
        accountId: existingAuth.accountId,
      });

      // 3.2 记录登录历史
      await this.accountService.recordLoginHistory(
        existingAuth.accountId,
        new Date().toISOString(),
        input.ip || '',
        'wechat_miniprogram',
      );

      // 3.3 返回登录成功的结果
      return {
        success: true,
        isNewUser: false,
        provider: ThirdPartyProviderEnum.WECHAT,
        providerUserId: wechatSession.openid,
        unionId: wechatSession.unionid,
        account: {
          id: accountWithAccessGroup.id,
          loginName: accountWithAccessGroup.loginName,
          loginEmail: accountWithAccessGroup.loginEmail,
          accessGroup: accountWithAccessGroup.accessGroup,
        },
        sessionKey: wechatSession.session_key,
      };
    }

    // 4. 如果没有找到绑定记录，进入第三方注册流程
    else {
      return this.prepareThirdPartyRegistration({
        provider: ThirdPartyProviderEnum.WECHAT,
        providerUserId: wechatSession.openid,
        unionId: wechatSession.unionid || null,
        sessionKey: wechatSession.session_key,
      });
    }
  }

  /**
   * 根据第三方信息查找账户
   * @param provider 第三方平台
   * @param providerUserId 第三方用户 ID
   * @returns 第三方认证记录
   */
  private async findAccountByThirdParty(
    provider: ThirdPartyProviderEnum,
    providerUserId: string,
  ): Promise<ThirdPartyAuthEntity | null> {
    return await this.thirdPartyAuthRepository.findOne({
      where: { provider, providerUserId },
      relations: ['account'],
    });
  }

  /**
   * 通过微信授权码获取 openId
   * @param code 微信授权码
   * @returns 包含了 session_key 与 openid 的对象
   */
  private async getWechatOpenId(code: string): Promise<WeAppLoginResult> {
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
      const response = await this.httpService.axiosRef.get<WeAppLoginResult>(url, {
        params,
        timeout: 10000,
      });

      const data = response.data;
      if (data.errcode) {
        throw new HttpException(`微信授权失败: ${data.errmsg}`, HttpStatus.BAD_REQUEST);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('获取微信 access_token 失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 通过微信 access_token 获取用户信息
   * @param accessToken 访问令牌
   * @param openid 用户 openid
   * @returns 用户信息
   */
  private async getWechatUserInfo(accessToken: string, openid: string): Promise<WechatUserInfo> {
    const url = 'https://api.weixin.qq.com/sns/userinfo';
    const params = {
      access_token: accessToken,
      openid,
      lang: 'zh_CN',
    };

    try {
      const response = await this.httpService.axiosRef.get<WechatUserInfo>(url, {
        params,
        timeout: 10000,
      });

      const data = response.data;

      if (data.errcode) {
        throw new HttpException(`获取微信用户信息失败: ${data.errmsg}`, HttpStatus.BAD_REQUEST);
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('获取微信用户信息失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 准备第三方注册数据
   * @param input 第三方用户数据
   * @returns 标准化的注册准备结果
   */
  private prepareThirdPartyRegistration(input: {
    provider: ThirdPartyProviderEnum;
    providerUserId: string;
    unionId?: string | null;
    sessionKey?: string;
    userInfo?: WechatUserInfo;
  }): ThirdPartyLoginResult {
    return {
      success: true,
      isNewUser: true,
      provider: input.provider,
      providerUserId: input.providerUserId,
      // 只在确实存在时才包含 unionId
      ...(input.unionId && { unionId: input.unionId }),
      // 只在微信小程序登录时才包含 sessionKey
      ...(input.sessionKey && { sessionKey: input.sessionKey }),
      nextStep: 'REGISTRATION_REQUIRED' as const,
      message: '检测到新用户，请完善注册信息',
      // 可选：预填充的用户信息
      ...(input.userInfo && {
        suggestedUserInfo: {
          nickname: input.userInfo.nickname,
          avatar: input.userInfo.headimgurl,
        },
      }),
    };
  }
}
