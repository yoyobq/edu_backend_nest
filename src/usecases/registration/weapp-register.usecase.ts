// src/usecases/registration/weapp-register.usecase.ts

import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
  UserAccountView,
} from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';
import { PinoLogger } from 'nestjs-pino';
import {
  ThirdPartyRegisterParams,
  ThirdPartyRegisterResult,
} from './register-with-third-party.usecase';
import { normalizeWeappRegisterInput } from './registration-input.normalize';

// 工具类型：用新类型覆盖原类型的指定字段
type Overwrite<T, U> = Omit<T, keyof U> & U;

/**
 * 验证后的微信小程序注册参数
 */
interface ValidatedWeappRegisterParams {
  authCredential: string;
  audience: AudienceTypeEnum;
}

/**
 * 微信小程序注册参数
 * 扩展通用第三方注册参数
 */
type WeappRegisterParams = Overwrite<
  ThirdPartyRegisterParams,
  {
    audience: AudienceTypeEnum; // 明确要求 audience 为必需参数
    weAppData?: {
      phoneCode?: string;
    }; // 确保 weAppData 在类型中存在
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
    private readonly accountQueryService: AccountQueryService,
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
    const { authCredential, audience } = validatedParams;
    const normalizedInput = normalizeWeappRegisterInput();

    try {
      // 2. 解析身份信息
      const session = await this.tpa.resolveIdentity({
        provider: ThirdPartyProviderEnum.WEAPP,
        authCredential,
        audience,
      });

      // 3. 检查是否已绑定
      await this.checkNotAlreadyBound(session.providerUserId);

      // 4. 准备账户数据
      const { accountData, userInfoData } = await this.prepareAccountData({
        defaultNickname: normalizedInput.defaultNickname,
        phoneCode: params.weAppData?.phoneCode,
        audience,
      });

      // 5. 创建账户
      const account = await this.createAccount({
        accountData,
        userInfoData,
      });

      // 6. 创建第三方绑定关系
      await this.tpa.bindThirdPartyForRegistration({
        accountId: account.id,
        provider: ThirdPartyProviderEnum.WEAPP,
        session,
      });

      if (account.status !== AccountStatus.ACTIVE) {
        await this.accountService.updateAccount(account.id, { status: AccountStatus.ACTIVE });
      }

      this.logger.info(`微信小程序注册成功: ${account.id}`);

      return {
        success: true,
        message: '注册成功',
        accountId: account.id,
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw new DomainError(
          THIRDPARTY_ERROR.PROVIDER_API_ERROR,
          error.message || '第三方服务调用失败',
        );
      }

      this.logger.error(
        `微信小程序注册失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new DomainError(THIRDPARTY_ERROR.REGISTRATION_FAILED, '微信小程序注册失败');
    }
  }

  /**
   * 验证身份凭证格式
   */
  private validateCredential(credential: string): void {
    if (!credential || credential.trim().length === 0) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_CREDENTIAL, '身份凭证不能为空');
    }
  }

  /**
   * 检查用户是否已绑定
   */
  private async checkNotAlreadyBound(providerUserId: string): Promise<void> {
    const existingBinding = await this.tpa.findAccountByThirdParty({
      provider: ThirdPartyProviderEnum.WEAPP,
      providerUserId,
    });

    if (existingBinding) {
      throw new DomainError(THIRDPARTY_ERROR.ACCOUNT_ALREADY_BOUND, '该微信账号已绑定其他账户');
    }
  }

  /**
   * 准备账户数据
   * 使用 AccountService 的 pickAvailableNickname 方法生成唯一昵称
   */
  private async prepareAccountData(params: {
    defaultNickname: string;
    phoneCode?: string;
    audience: AudienceTypeEnum;
  }) {
    const { defaultNickname, phoneCode, audience } = params;

    // 使用 AccountService 生成唯一的"微信用户"昵称
    const nickname = await this.accountService.pickAvailableNickname({
      providedNickname: defaultNickname,
      fallbackOptions: [],
      provider: ThirdPartyProviderEnum.WEAPP,
    });

    if (!nickname) {
      throw new DomainError(THIRDPARTY_ERROR.REGISTRATION_FAILED, '生成用户昵称失败');
    }

    // 获取手机号 - 简化调用
    let phone: string | undefined;
    if (phoneCode) {
      try {
        const phoneInfo = await this.tpa.getWeappPhoneNumber({
          phoneCode: phoneCode,
          audience,
        });

        phone = phoneInfo.phoneNumber;

        this.logger.info('成功获取用户手机号', { phoneNumber: phone });
      } catch (error) {
        this.logger.error('获取手机号失败', { error, phoneCode: '[REDACTED]' });
        // 注册流程中手机号获取失败不应该阻止注册，只是记录日志
      }
    }

    // 准备账户数据
    const accountData = {
      status: AccountStatus.ACTIVE,
      audience,
      loginEmail: `weapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@local`,
      loginPassword: `Tmp#${Date.now()}Aa1`,
      identityHint: IdentityTypeEnum.REGISTRANT,
    };

    // 准备用户信息数据
    const userInfoData = {
      nickname,
      phone,
      accessGroup: [IdentityTypeEnum.REGISTRANT],
      metaDigest: [IdentityTypeEnum.REGISTRANT],
    };

    return { accountData, userInfoData };
  }

  /**
   * 验证参数
   */
  private validateParams(params: WeappRegisterParams): ValidatedWeappRegisterParams {
    const { authCredential, audience } = params;

    // 验证身份凭证
    this.validateCredential(authCredential);

    // 验证 audience
    if (!audience || !Object.values(AudienceTypeEnum).includes(audience)) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_AUDIENCE, '无效的客户端类型');
    }

    return {
      authCredential,
      audience,
    };
  }

  /**
   * 创建账户与用户信息
   * @param params 创建参数
   * @returns 账户视图
   */
  private async createAccount(params: {
    accountData: {
      status: AccountStatus;
      audience: AudienceTypeEnum;
      loginEmail: string;
      loginPassword: string;
      identityHint: IdentityTypeEnum;
    };
    userInfoData: {
      nickname: string;
      phone?: string;
      accessGroup: IdentityTypeEnum[];
      metaDigest: IdentityTypeEnum[];
    };
  }): Promise<UserAccountView> {
    const { accountData, userInfoData } = params;
    return await this.accountService.runTransaction(async (manager) => {
      const account = this.accountService.createAccountEntity({
        manager,
        accountData: {
          ...accountData,
          loginPassword: 'temp',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const savedAccount = await this.accountService.saveAccount({ account, manager });

      savedAccount.loginPassword = AccountService.hashPasswordWithTimestamp(
        accountData.loginPassword,
        savedAccount.createdAt,
      );
      await this.accountService.saveAccount({ account: savedAccount, manager });

      const userInfo = this.accountService.createUserInfoEntity({
        manager,
        userInfoData: {
          accountId: savedAccount.id,
          ...userInfoData,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await this.accountService.saveUserInfo({ userInfo, manager });

      return this.accountQueryService.toUserAccountView(savedAccount);
    });
  }
}
