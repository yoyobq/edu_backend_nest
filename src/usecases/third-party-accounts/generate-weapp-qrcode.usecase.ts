// 文件位置：src/usecases/third-party-accounts/generate-weapp-qrcode.usecase.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { WeAppProvider } from '@modules/third-party-auth/providers/weapp.provider';
import { HttpException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export interface GenerateWeappQrcodeParams {
  /** 客户端类型 */
  audience: AudienceTypeEnum;
  /** 场景值（最多 32 个可见字符），建议格式：t=<base62> */
  scene: string;
  /** 小程序页面路径（不带参数，示例：pages/index/index） */
  page?: string;
  /** 图片宽度（像素，280–1280） */
  width?: number;
  /** 是否校验页面路径（默认 true） */
  checkPath?: boolean;
  /** 小程序版本（develop/trial/release） */
  envVersion?: 'develop' | 'trial' | 'release';
  /** 是否透明底色 */
  isHyaline?: boolean;
  /** 是否返回 base64，默认 true；false 则返回 Buffer */
  encodeBase64?: boolean;
}

export interface GenerateWeappQrcodeResult {
  /** 图片内容类型（通常为 image/png） */
  contentType: string;
  /** 图片 Base64 字符串（当 encodeBase64=true 时返回） */
  imageBase64?: string;
  /** 图片二进制（当 encodeBase64=false 时返回） */
  imageBuffer?: Buffer;
}

/**
 * 生成微信小程序二维码 Usecase
 * 负责编排：通过 appid + secret 换取 access_token，然后调用微信 "getwxacodeunlimit" 生成二维码
 */
@Injectable()
export class GenerateWeappQrcodeUsecase {
  constructor(
    private readonly weappProvider: WeAppProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerateWeappQrcodeUsecase.name);
  }

  /**
   * 执行生成二维码流程
   * @param params 对象参数
   * @returns 二维码图片数据
   */
  async execute(params: GenerateWeappQrcodeParams): Promise<GenerateWeappQrcodeResult> {
    this.logger.info('开始生成微信小程序二维码', {
      params: { ...params, scene: '[REDACTED]' },
    });

    try {
      this.validateParams(params);

      // 统一外层场景规范：建议 't=' + base62 token
      const normalizedScene = this.normalizeScene(params.scene);

      const accessToken = await this.getAccessToken(params.audience);

      const { buffer, contentType } = await this.weappProvider.createWxaCodeUnlimit({
        accessToken,
        scene: normalizedScene,
        page: params.page,
        width: params.width,
        checkPath: params.checkPath,
        envVersion: params.envVersion,
        isHyaline: params.isHyaline,
      });

      const encodeBase64 = params.encodeBase64 !== false;
      const result: GenerateWeappQrcodeResult = { contentType };
      if (encodeBase64) {
        result.imageBase64 = buffer.toString('base64');
      } else {
        result.imageBuffer = buffer;
      }

      this.logger.info('生成微信小程序二维码成功');
      return result;
    } catch (error) {
      this.logger.error('生成微信小程序二维码失败', {
        error,
        params: { ...params, scene: '[REDACTED]' },
      });

      if (error instanceof DomainError) {
        throw error;
      }
      if (error instanceof HttpException) {
        throw new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, error.message);
      }
      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '生成二维码时发生未知错误');
    }
  }

  /**
   * 验证输入参数
   * @param params 原始参数
   */
  private validateParams(params: GenerateWeappQrcodeParams): void {
    if (!params.audience) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'audience 不能为空');
    }
    if (!params.scene || typeof params.scene !== 'string') {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'scene 必须为非空字符串');
    }
    if (params.scene.length > 32) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'scene 字符串长度不能超过 32');
    }
    if (typeof params.width === 'number') {
      const w = params.width;
      if (!Number.isFinite(w) || w < 280 || w > 1280) {
        throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'width 必须在 280–1280 范围内');
      }
    }
    if (params.envVersion) {
      const allowed: Array<'develop' | 'trial' | 'release'> = ['develop', 'trial', 'release'];
      if (!allowed.includes(params.envVersion)) {
        throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'envVersion 值非法');
      }
    }
  }

  /**
   * 规范化场景值：推荐 't=' + base62 token
   * - 如已符合规则则直接返回
   * - 如为简单短字符串则保留
   */
  private normalizeScene(scene: string): string {
    // 已含推荐前缀直接返回（不展开 base62 生成器避免过度设计）
    if (scene.startsWith('t=')) return scene;
    // 长度安全剪裁：防止超过 32
    if (scene.length > 32) return scene.slice(0, 32);
    return scene;
  }

  /**
   * 获取微信小程序 access_token
   * @param audience 客户端类型
   * @returns access_token
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
