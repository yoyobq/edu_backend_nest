// src/usecases/third-party-accounts/get-weapp-phone.usecase.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { PhoneNumberResult } from '@app-types/models/third-party-auth.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { WeAppProvider } from '@modules/third-party-auth/providers/weapp.provider';
import { HttpException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

/**
 * 获取微信小程序手机号参数
 */
export interface GetWeappPhoneParams {
  /** 手机号获取凭证 */
  phoneCode: string;
  /** 客户端类型 */
  audience: AudienceTypeEnum;
}

/**
 * 获取微信小程序手机号结果
 */
export interface GetWeappPhoneResult {
  /** 手机号信息 */
  phoneInfo: PhoneNumberResult;
}

/**
 * 获取微信小程序用户手机号 Usecase
 * 专门负责从微信 API 获取手机号，不处理数据库操作
 */
@Injectable()
export class GetWeappPhoneUsecase {
  constructor(
    private readonly weappProvider: WeAppProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetWeappPhoneUsecase.name);
  }

  /**
   * 执行获取微信小程序手机号
   * @param params 获取参数
   * @returns 手机号信息
   * @throws DomainError 当参数无效或 API 调用失败时抛出异常
   */
  async execute(params: GetWeappPhoneParams): Promise<GetWeappPhoneResult> {
    this.logger.info('开始从微信 API 获取手机号', {
      params: { ...params, phoneCode: '[REDACTED]' },
    });

    try {
      // 1. 验证参数
      this.validateParams(params);

      // 2. 获取 access_token
      const accessToken = await this.getAccessToken(params.audience);

      // 3. 调用微信 API 获取手机号
      const phoneInfo = await this.weappProvider.getPhoneNumber({
        phoneCode: params.phoneCode,
        accessToken,
        audience: params.audience,
      });

      this.logger.info('成功从微信 API 获取手机号', {
        phoneNumber: phoneInfo.phoneNumber,
      });

      return {
        phoneInfo,
      };
    } catch (error) {
      this.logger.error('从微信 API 获取手机号失败', {
        error,
        params: { ...params, phoneCode: '[REDACTED]' },
      });

      if (error instanceof DomainError) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, error.message);
      }

      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '获取手机号时发生未知错误');
    }
  }

  /**
   * 验证输入参数
   * @param params 原始参数
   * @throws DomainError 当参数无效时抛出异常
   */
  private validateParams(params: GetWeappPhoneParams): void {
    if (!params.phoneCode || typeof params.phoneCode !== 'string') {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_CREDENTIAL, 'phoneCode 不能为空');
    }

    if (!params.audience) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_CREDENTIAL, 'audience 不能为空');
    }
  }

  /**
   * 获取微信小程序 access_token
   * @param audience 客户端类型
   * @returns access_token
   * @throws DomainError 当获取 access_token 失败时抛出异常
   */
  private async getAccessToken(audience: AudienceTypeEnum): Promise<string> {
    try {
      return await this.weappProvider.getAccessToken({ audience });
    } catch (error) {
      this.logger.error('获取微信小程序 access_token 失败', { error, audience });

      if (error instanceof HttpException) {
        throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, error.message);
      }

      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, '获取 access_token 失败');
    }
  }
}
