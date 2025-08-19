// src/usecases/registration/weapp-register.usecase.ts

import {
  AccountStatus,
  AudienceTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { Gender, GeographicInfo } from '@app-types/models/user-info.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { normalizeText } from '@core/common/text/text.helper';
import { AccountService } from '@modules/account/account.service';
import { ThirdPartyAuthEntity } from '@modules/account/entities/third-party-auth.entity';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { PinoLogger } from 'nestjs-pino';
import { EntityManager } from 'typeorm';
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
  gender?: 0 | 1 | 2; // 微信返回：0=SECRET, 1=MALE, 2=FEMALE
  city?: string;
  province?: string;
  avatarUrl?: string;
}

/**
 * 验证后的微信小程序注册参数
 */
interface ValidatedWeappRegisterParams {
  credential: string;
  audience: AudienceTypeEnum;
  wechatUserInfo?: WechatUserInfo;
}

/**
 * 微信小程序注册参数
 * 扩展通用第三方注册参数，添加微信用户信息
 */
type WeappRegisterParams = Overwrite<
  ThirdPartyRegisterParams,
  {
    audience: AudienceTypeEnum; // 明确要求 audience 为必需参数
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
    private readonly createAccountUsecase: CreateAccountUsecase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WeappRegisterUsecase.name);
  }

  /**
   * 执行微信小程序注册
   */
  async execute(params: WeappRegisterParams): Promise<ThirdPartyRegisterResult> {
    // 1. 参数验证
    const validatedParams = this.validateParams(params);
    const { credential, audience, wechatUserInfo } = validatedParams;

    try {
      // 2. 解析身份信息
      const session = await this.tpa.resolveIdentity({
        provider: ThirdPartyProviderEnum.WEAPP,
        credential,
        audience,
      });

      // 3. 检查是否已绑定
      await this.checkNotAlreadyBound(session.providerUserId);

      // 4. 验证和处理昵称
      const processedNickname = this.validateAndProcessNickname(wechatUserInfo?.nickName);

      // 5. 准备账户数据
      const accountData = await this.prepareAccountData({
        session,
        wechatUserInfo: {
          ...wechatUserInfo,
          nickName: processedNickname,
        },
      });

      // 5. 在一个事务中完成账户创建和第三方绑定
      const result = await this.accountService.runTransaction(async (manager: EntityManager) => {
        // 5.1 创建账户和用户信息（复用现有事务）
        const account = await this.createAccountUsecase.execute({
          accountData: accountData.accountData,
          userInfoData: accountData.userInfoData,
          manager, // 传入事务管理器
        });

        // 5.2 在同一事务中创建第三方绑定
        const thirdPartyAuth = await this.createThirdPartyBinding(manager, account.id, session);

        return { account, thirdPartyAuth };
      });

      this.logger.info(
        {
          accountId: result.account.id,
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: session.providerUserId,
          audience: audience, // 修复：使用正确的变量名
        },
        '微信小程序注册成功',
      );

      return {
        success: true,
        message: '微信小程序注册成功',
        accountId: result.account.id,
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
    wechatUserInfo?: WechatUserInfo;
  }) {
    const { session, wechatUserInfo } = params;

    // 对微信昵称进行文本规范化处理（包括 emoji 过滤）
    const normalizedWechatNickname = wechatUserInfo?.nickName
      ? normalizeText(wechatUserInfo.nickName)
      : undefined;

    // 使用 AccountService 的通用昵称处理方法
    const finalNickname = await this.accountService.pickAvailableNickname({
      providedNickname: normalizedWechatNickname,
      fallbackOptions: [], // 微信昵称就是唯一来源，不需要其他备选
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
        // TODO: 头像处理应该在专门的文件上传/用户资料管理模块中处理
        // avatar: wechatUserInfo?.avatarUrl,
        geographic,
        accessGroup: ['REGISTRANT'],
        metaDigest: ['REGISTRANT'],
      },
    };
  }

  /**
   * 在事务中创建第三方绑定关系
   * @param manager 事务管理器
   * @param accountId 账户 ID
   * @param session 第三方会话信息
   * @returns 创建的第三方绑定实体
   */
  private async createThirdPartyBinding(
    manager: EntityManager,
    accountId: number,
    session: ThirdPartySession,
  ): Promise<ThirdPartyAuthEntity> {
    try {
      // 在事务中检查是否已绑定（双重检查，防止并发问题）
      const existedByAccount = await manager.findOne(ThirdPartyAuthEntity, {
        where: { accountId, provider: ThirdPartyProviderEnum.WEAPP },
      });
      if (existedByAccount) {
        throw new DomainError(THIRDPARTY_ERROR.ACCOUNT_ALREADY_BOUND, '该账户已绑定微信小程序平台');
      }

      const existedByProvider = await manager.findOne(ThirdPartyAuthEntity, {
        where: {
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: session.providerUserId,
        },
      });
      if (existedByProvider) {
        throw new DomainError(
          THIRDPARTY_ERROR.ACCOUNT_ALREADY_BOUND,
          '该微信小程序账户已被其他用户绑定',
        );
      }

      // 创建新的绑定关系
      const thirdPartyAuth = manager.create(ThirdPartyAuthEntity, {
        accountId,
        provider: ThirdPartyProviderEnum.WEAPP,
        providerUserId: session.providerUserId,
        unionId: session.unionId || null,
        accessToken: null,
      });

      return await manager.save(thirdPartyAuth);
    } catch (error) {
      this.logger.error(
        {
          accountId,
          provider: ThirdPartyProviderEnum.WEAPP,
          providerUserId: session.providerUserId,
          error: error instanceof Error ? error.message : String(error),
        },
        '创建第三方绑定失败',
      );

      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(THIRDPARTY_ERROR.BIND_FAILED, '绑定微信小程序账户失败', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 验证微信用户信息的类型守卫
   */
  private isValidWechatUserInfo(userInfo: unknown): userInfo is WechatUserInfo {
    if (!userInfo || typeof userInfo !== 'object') {
      return true; // 允许为空
    }

    const info = userInfo as Record<string, unknown>;

    // 验证 nickName
    if (info.nickName !== undefined && typeof info.nickName !== 'string') {
      return false;
    }

    // 验证 gender
    if (info.gender !== undefined && ![0, 1, 2].includes(info.gender as number)) {
      return false;
    }

    // 验证地理信息
    if (info.city !== undefined && typeof info.city !== 'string') {
      return false;
    }

    if (info.province !== undefined && typeof info.province !== 'string') {
      return false;
    }

    // 验证头像 URL
    if (info.avatarUrl !== undefined && typeof info.avatarUrl !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * 验证注册参数的完整性和有效性
   */
  private validateParams(params: WeappRegisterParams): ValidatedWeappRegisterParams {
    // 验证凭证
    if (!params.credential?.trim()) {
      throw new DomainError(THIRDPARTY_ERROR.CREDENTIAL_INVALID, '微信小程序凭证不能为空');
    }

    // 验证凭证格式（微信 js_code 通常是 32 位字符串）
    if (!/^[A-Za-z0-9]{10,50}$/.test(params.credential.trim())) {
      throw new DomainError(THIRDPARTY_ERROR.CREDENTIAL_INVALID, '微信小程序凭证格式无效');
    }

    // 验证 audience
    if (!params.audience || !Object.values(AudienceTypeEnum).includes(params.audience)) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_AUDIENCE, '客户端类型无效');
    }

    // 验证微信用户信息
    if (params.wechatUserInfo && !this.isValidWechatUserInfo(params.wechatUserInfo)) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_USER_INFO, '微信用户信息格式无效');
    }

    return {
      credential: params.credential.trim(),
      audience: params.audience,
      wechatUserInfo: params.wechatUserInfo,
    };
  }

  /**
   * 验证和处理昵称
   */
  private validateAndProcessNickname(nickname?: string): string | undefined {
    if (!nickname?.trim()) {
      return undefined;
    }

    const trimmed = nickname.trim();

    // 长度验证
    if (trimmed.length < 2 || trimmed.length > 20) {
      this.logger.warn({ nickname: trimmed }, '微信昵称长度不符合要求，将使用默认昵称');
      return undefined;
    }

    // 格式验证（与 GraphQL DTO 保持一致）
    const nicknameRegex =
      /^(?![\p{Script=Han}]{8,})[\p{Script=Han}A-Za-z0-9 _\-\u00B7\u30FB.]{2,20}$/u;
    if (!nicknameRegex.test(trimmed)) {
      this.logger.warn({ nickname: trimmed }, '微信昵称格式不符合要求，将使用默认昵称');
      return undefined;
    }

    return normalizeText(trimmed);
  }
}
