// src/usecases/registration/weapp-register.usecase.ts

import {
  AccountStatus,
  AudienceTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { Gender, GeographicInfo } from '@app-types/models/user-info.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { AccountService } from '@modules/account/account.service';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { PinoLogger } from 'nestjs-pino';
import { ThirdPartySession } from '../../types/models/third-party-auth.types';
import {
  ThirdPartyRegisterParams,
  ThirdPartyRegisterResult,
} from './register-with-third-party.usecase';

// 工具类型：用新类型覆盖原类型的指定字段
type Overwrite<T, U> = Omit<T, keyof U> & U;

/**
 * 微信用户信息接口
 */
interface WechatUserInfo {
  nickName?: string;
  gender?: number; // 微信返回：0=未知, 1=男, 2=女
  city?: string;
  province?: string;
  avatarUrl?: string;
}

/**
 * 微信小程序注册参数
 * 扩展通用第三方注册参数，添加微信用户信息
 */
type WeappRegisterParams = Overwrite<
  ThirdPartyRegisterParams,
  {
    wechatUserInfo?: WechatUserInfo;
  }
>;

/**
 * 微信小程序注册 Usecase
 * 专门处理微信小程序的注册逻辑
 */
@Injectable()
export class WeappRegisterUsecase {
  constructor(
    private readonly tpa: ThirdPartyAuthService,
    private readonly accountService: AccountService,
    private readonly createAccount: CreateAccountUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WeappRegisterUsecase.name);
  }

  /**
   * 执行微信小程序注册
   */
  async execute(params: WeappRegisterParams): Promise<ThirdPartyRegisterResult> {
    const { credential, audience, nickname, wechatUserInfo } = params;
    const audienceType = String(audience ?? '') as AudienceTypeEnum;

    // 1. 验证凭证
    this.validateCredential(credential);

    // 2. 解析身份信息
    try {
      const session = await this.tpa.resolveIdentity({
        provider: ThirdPartyProviderEnum.WEAPP,
        credential,
        audience: audienceType,
      });

      // 3. 检查是否已绑定
      await this.checkNotAlreadyBound(session.providerUserId);

      // 4. 准备账户数据
      const accountData = await this.prepareAccountData({
        session,
        nickname,
        wechatUserInfo,
      });

      // 5. 创建账户
      const account = await this.createAccount.execute(accountData);

      // 6. 建立绑定
      await this.bindThirdPartyAccount(account.id, session);

      this.logger.info(
        {
          accountId: account.id,
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: session.providerUserId,
          audience: audienceType,
        },
        '微信小程序注册成功',
      );

      return {
        success: true,
        message: '微信小程序注册成功',
        accountId: account.id,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        const resp = error.getResponse() as
          | string
          | { errorCode?: string; errorMessage?: string; message?: string };

        const code =
          typeof resp === 'object' && resp?.errorCode
            ? String(resp.errorCode)
            : THIRDPARTY_ERROR.CREDENTIAL_INVALID;

        const message =
          typeof resp === 'object' && (resp.errorMessage || resp.message)
            ? String(resp.errorMessage || resp.message)
            : '微信小程序凭证无效或已过期';

        throw new DomainError(code, message);
      }

      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(THIRDPARTY_ERROR.REGISTRATION_FAILED, '微信小程序注册失败', {
        cause: (error as Error)?.message,
      });
    }
  }

  /**
   * 验证微信小程序凭证
   */
  private validateCredential(credential: string): void {
    if (!credential?.trim()) {
      throw new DomainError(
        THIRDPARTY_ERROR.CREDENTIAL_INVALID,
        '未提供微信小程序凭证或凭证无效，无法注册',
      );
    }
  }

  /**
   * 检查第三方账户是否已绑定
   */
  private async checkNotAlreadyBound(providerUserId: string): Promise<void> {
    const existed = await this.tpa.findAccountByThirdParty({
      provider: ThirdPartyProviderEnum.WEAPP,
      providerUserId,
    });

    if (existed?.accountId) {
      throw new DomainError(THIRDPARTY_ERROR.ACCOUNT_ALREADY_BOUND, '该微信小程序账户已被绑定', {
        accountId: existed.accountId,
      });
    }
  }

  /**
   * 准备账户创建数据
   */
  private async prepareAccountData(params: {
    session: ThirdPartySession;
    nickname?: string;
    wechatUserInfo?: WechatUserInfo;
  }) {
    const { session, wechatUserInfo } = params;

    // 使用 AccountService 的通用昵称处理方法
    const finalNickname = await this.accountService.pickAvailableNickname({
      providedNickname: wechatUserInfo?.nickName,
      fallbackOptions: [],
      provider: ThirdPartyProviderEnum.WEAPP,
    });

    // 处理微信用户信息
    const geographic: GeographicInfo | undefined =
      wechatUserInfo?.province || wechatUserInfo?.city
        ? {
            province: wechatUserInfo.province || '',
            city: wechatUserInfo.city || '',
          }
        : undefined;

    const gender: Gender =
      wechatUserInfo?.gender === 1
        ? Gender.MALE
        : wechatUserInfo?.gender === 2
          ? Gender.FEMALE
          : Gender.SECRET;

    return {
      accountData: {
        loginName: null, // 第三方登录用户不需要登录名
        loginEmail: `${session.providerUserId}@weapp.local`, // 保留作为唯一标识
        loginPassword: '', // 第三方登录用户不需要密码
        status: AccountStatus.ACTIVE,
        identityHint: 'REGISTRANT',
      },
      userInfoData: {
        nickname: finalNickname,
        gender,
        avatar: wechatUserInfo?.avatarUrl,
        geographic,
        accessGroup: ['REGISTRANT'],
        metaDigest: ['REGISTRANT'],
      },
    };
  }

  /**
   * 绑定第三方账户
   */
  private async bindThirdPartyAccount(
    accountId: number,
    session: ThirdPartySession,
  ): Promise<void> {
    try {
      await this.tpa.bindThirdPartyForRegistration({
        accountId,
        provider: ThirdPartyProviderEnum.WEAPP,
        session,
      });
    } catch (bindError) {
      // 如果绑定失败，需要考虑是否回滚已创建的账户
      this.logger.error(
        {
          accountId,
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: session.providerUserId,
          error: bindError instanceof Error ? bindError.message : String(bindError),
        },
        '绑定第三方账户失败',
      );
      throw new DomainError(THIRDPARTY_ERROR.BIND_FAILED, '绑定微信小程序账户失败', {
        cause: bindError instanceof Error ? bindError.message : String(bindError),
      });
    }
  }
}
