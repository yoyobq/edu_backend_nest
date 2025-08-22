// src/usecases/registration/weapp-register.usecase.ts

import {
  AccountStatus,
  AudienceTypeEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { AccountService } from '@modules/account/account.service';
import { ThirdPartyAuthEntity } from '@modules/account/entities/third-party-auth.entity';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { HttpException, Injectable } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { GetWeappPhoneUsecase } from '@usecases/third-party-accounts/get-weapp-phone.usecase';
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
    private readonly createAccountUsecase: CreateAccountUsecase,
    private readonly getWeappPhoneUsecase: GetWeappPhoneUsecase,
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
        phoneCode: params.weAppData?.phoneCode,
        audience,
      });

      // 5. 创建账户
      const account = await this.createAccountUsecase.execute({
        accountData,
        userInfoData,
      });

      // 6. 创建第三方绑定关系
      await this.accountService.runTransaction(async (manager: EntityManager) => {
        await this.createThirdPartyBinding(manager, account.id, session);
      });

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
        throw error;
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
  private async prepareAccountData(params: { phoneCode?: string; audience: AudienceTypeEnum }) {
    const { phoneCode, audience } = params;

    // 使用 AccountService 生成唯一的"微信用户"昵称
    const nickname = await this.accountService.pickAvailableNickname({
      providedNickname: '微信用户',
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
        const phoneResult = await this.getWeappPhoneUsecase.execute({
          phoneCode: phoneCode,
          audience: audience,
        });

        phone = phoneResult.phoneInfo.phoneNumber;

        this.logger.info('成功获取用户手机号', { phoneNumber: phone });
      } catch (error) {
        this.logger.error('获取手机号失败', { error, phoneCode: '[REDACTED]' });
        // 注册流程中手机号获取失败不应该阻止注册，只是记录日志
      }
    }

    // 准备账户数据
    const accountData = {
      status: AccountStatus.ACTIVE,
      audience: audience, // 使用传入的 audience 参数
    };

    // 准备用户信息数据
    const userInfoData = {
      nickname,
      avatar: undefined, // 微信小程序不再获取头像
      geographicInfo: undefined, // 微信小程序不再获取地理信息
      gender: undefined, // 微信小程序不再获取性别
      phone, // 添加手机号字段
      accessGroup: ['guest'], // 添加默认的访问权限组
    };

    return { accountData, userInfoData };
  }

  /**
   * 创建第三方绑定关系
   */
  private async createThirdPartyBinding(
    manager: EntityManager,
    accountId: number,
    session: ThirdPartySession,
  ): Promise<ThirdPartyAuthEntity> {
    const thirdPartyAuth = new ThirdPartyAuthEntity();
    thirdPartyAuth.accountId = accountId;
    thirdPartyAuth.provider = ThirdPartyProviderEnum.WEAPP;
    thirdPartyAuth.providerUserId = session.providerUserId;
    thirdPartyAuth.unionId = session.unionId;
    // 移除 profile 字段赋值，因为 ThirdPartyAuthEntity 中没有此字段
    thirdPartyAuth.createdAt = new Date();
    thirdPartyAuth.updatedAt = new Date();

    return await manager.save(ThirdPartyAuthEntity, thirdPartyAuth);
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
}
