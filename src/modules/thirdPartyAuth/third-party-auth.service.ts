// src/modules/thirdPartyAuth/third-party-auth.service.ts
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThirdPartyProviderEnum } from '../../types/models/account.types';
import { AccountService } from '../account/account.service';
import { ThirdPartyAuthEntity } from '../account/entities/third-party-auth.entity';
import { BindThirdPartyInput } from './dto/bind-third-party.input';
import { ThirdPartyLoginInput } from './dto/third-party-login.input';
import { UnbindThirdPartyInput } from './dto/unbind-third-party.input';

/**
 * 微信 access_token 响应接口
 */
// interface WechatTokenResponse {
//   access_token: string;
//   expires_in: number;
//   refresh_token: string;
//   openid: string;
//   scope: string;
//   unionid?: string;
//   errcode?: number;
//   errmsg?: string;
// }

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
 * 第三方登录认证服务
 */
@Injectable()
export class ThirdPartyAuthService {
  constructor(
    @InjectRepository(ThirdPartyAuthEntity)
    private readonly thirdPartyAuthRepository: Repository<ThirdPartyAuthEntity>,
    private readonly accountService: AccountService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 第三方登录处理
   * @param input 第三方登录参数
   * @returns 第三方用户信息和绑定状态
   */
  async thirdPartyLogin(input: ThirdPartyLoginInput) {
    switch (input.provider) {
      case ThirdPartyProviderEnum.WEAPP:
        return await this.weAppLogin(input);
      case ThirdPartyProviderEnum.WECHAT:
      case ThirdPartyProviderEnum.QQ:
      case ThirdPartyProviderEnum.GOOGLE:
      case ThirdPartyProviderEnum.GITHUB:
        throw new HttpException(`${input.provider} 登录暂未实现`, HttpStatus.NOT_IMPLEMENTED);
      default:
        throw new HttpException('不支持的第三方登录平台', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 绑定第三方账户
   * @param accountId 账户 ID
   * @param input 绑定参数
   * @returns 绑定结果
   */
  async bindThirdParty(
    accountId: number,
    input: BindThirdPartyInput,
  ): Promise<ThirdPartyAuthEntity> {
    // 检查是否已经绑定过该平台
    const existingBind = await this.thirdPartyAuthRepository.findOne({
      where: {
        accountId,
        provider: input.provider,
      },
    });

    if (existingBind) {
      throw new HttpException(`该账户已绑定 ${input.provider} 平台`, HttpStatus.CONFLICT);
    }

    // 检查该第三方账户是否已被其他账户绑定
    const existingProvider = await this.thirdPartyAuthRepository.findOne({
      where: {
        provider: input.provider,
        providerUserId: input.providerUserId,
      },
    });

    if (existingProvider) {
      throw new HttpException(`该 ${input.provider} 账户已被其他用户绑定`, HttpStatus.CONFLICT);
    }

    // 创建绑定记录
    const thirdPartyAuth = this.thirdPartyAuthRepository.create({
      accountId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      unionId: input.unionId,
      accessToken: input.accessToken,
    });

    return await this.thirdPartyAuthRepository.save(thirdPartyAuth);
  }

  /**
   * 解绑第三方账户
   * @param accountId 账户 ID
   * @param input 解绑参数
   * @returns 解绑结果
   */
  async unbindThirdParty(accountId: number, input: UnbindThirdPartyInput): Promise<boolean> {
    const result = await this.thirdPartyAuthRepository.delete({
      accountId,
      provider: input.provider,
    });

    if (result.affected === 0) {
      throw new HttpException(`未找到 ${input.provider} 平台的绑定记录`, HttpStatus.NOT_FOUND);
    }

    return true;
  }

  /**
   * 获取用户的第三方绑定列表
   * @param accountId 账户 ID
   * @returns 第三方绑定列表
   */
  async getThirdPartyAuths(accountId: number): Promise<ThirdPartyAuthEntity[]> {
    return await this.thirdPartyAuthRepository.find({
      where: { accountId },
      select: ['id', 'provider', 'providerUserId', 'unionId', 'createdAt'],
    });
  }

  /**
   * 根据第三方信息查找账户
   * @param provider 第三方平台
   * @param providerUserId 第三方用户 ID
   * @returns 第三方认证记录
   */
  async findAccountByThirdParty(
    provider: ThirdPartyProviderEnum,
    providerUserId: string,
  ): Promise<ThirdPartyAuthEntity | null> {
    return await this.thirdPartyAuthRepository.findOne({
      where: { provider, providerUserId },
      relations: ['account'],
    });
  }

  /**
   * 微信小程序登录处理
   * @param input 登录参数
   * @returns 微信用户信息和账户绑定状态
   */
  private async weAppLogin(input: ThirdPartyLoginInput) {
    // 1. 通过授权码获取 openId
    const wechatSession = await this.getWechatOpenId(input.authCredential);

    // 2. 通过 openId 去 third-party 实体中获取用户 accountId，如果有，拉取相关信息完成登录
    // 如果没有进入第三方注册流程

    // 2.1 通过 openId 查找是否已有绑定的第三方认证记录
    const existingAuth = await this.findAccountByThirdParty(
      ThirdPartyProviderEnum.WECHAT,
      wechatSession.openid,
    );

    // 2.2 如果找到了绑定记录，说明用户已注册，执行登录流程
    if (existingAuth && existingAuth.account) {
      // 2.2.1 获取完整的账户信息
      const accountWithAccessGroup = await this.accountService.getUserWithAccessGroup({
        accountId: existingAuth.accountId,
      });

      // 2.2.2 记录登录历史
      await this.accountService.recordLoginHistory(
        existingAuth.accountId,
        new Date().toISOString(),
        // input.clientIp || '', // 如果有客户端 IP
        'wechat_miniprogram',
      );

      // 2.2.3 返回登录成功的结果
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

    // 2.3 如果没有找到绑定记录，进入第三方注册流程
    else {
      // 调用第三方注册准备函数
      return this.prepareThirdPartyRegistration({
        provider: ThirdPartyProviderEnum.WECHAT,
        providerUserId: wechatSession.openid,
        unionId: wechatSession.unionid || null, // 处理可能为空的情况
        sessionKey: wechatSession.session_key,
        // 可以在这里获取微信用户信息用于预填充
        // userInfo: await this.getWechatUserInfo(wechatSession.access_token, wechatSession.openid)
      });
    }
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
      console.log(data);
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
  }) {
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
