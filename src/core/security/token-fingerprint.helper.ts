// src/core/security/token-fingerprint.helper.ts
import { createHash } from 'crypto';
import { AudienceTypeEnum } from '@app-types/models/account.types';

/**
 * Token 指纹生成工具类
 * 用于生成 token 的 SHA-256 哈希指纹，支持可选的 audience 参数
 */
export class TokenFingerprintHelper {
  /**
   * 生成 token 指纹
   * @param params - 参数对象
   * @param params.token - 需要生成指纹的 token
   * @param params.audience - 可选的受众类型，用于平台识别
   * @returns Buffer - SHA-256 哈希结果
   */
  static generateTokenFingerprint(params: {
    token: string;
    audience?: AudienceTypeEnum | null;
  }): Buffer {
    const { token, audience } = params;

    // 如果提供了 audience，将其与 token 组合
    const input = audience ? `${token}:${audience}` : token;

    return createHash('sha256').update(input, 'utf8').digest();
  }

  /**
   * 验证 token 指纹
   * @param params - 参数对象
   * @param params.token - 原始 token
   * @param params.audience - 可选的受众类型
   * @param params.expectedFingerprint - 期望的指纹值
   * @returns boolean - 验证结果
   */
  static verifyTokenFingerprint(params: {
    token: string;
    audience?: AudienceTypeEnum | null;
    expectedFingerprint: Buffer;
  }): boolean {
    const { token, audience, expectedFingerprint } = params;

    const actualFingerprint = this.generateTokenFingerprint({ token, audience });

    return actualFingerprint.equals(expectedFingerprint);
  }
}
