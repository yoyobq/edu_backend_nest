// src/core/common/token/verification-code.helper.ts

import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';

/**
 * 验证码生成配置
 */
export interface VerificationCodeConfig {
  /** 验证码长度 */
  length?: number;
  /** 是否生成数字验证码 */
  numeric?: boolean;
  /** 编码格式：'hex' | 'base64url' */
  encoding?: 'hex' | 'base64url';
}

/**
 * 验证码助手类
 * 提供加密安全的验证码和验证令牌生成功能
 */
@Injectable()
export class VerificationCodeHelper {
  /**
   * 生成验证码
   * @param config 生成配置
   * @returns 生成的验证码字符串
   */
  generateCode(config: VerificationCodeConfig = {}): string {
    const { length = 32, numeric = false, encoding = 'base64url' } = config;

    if (numeric) {
      return this.generateNumericCode(length);
    }

    return this.generateTokenString(length, encoding);
  }

  /**
   * 根据字符数生成 Base64URL 令牌
   * 内部会计算所需的字节数，并在末尾截断到指定字符数
   * @param charCount 期望的字符数
   * @returns 指定字符数的 Base64URL 令牌
   */
  generateTokenByChars(charCount: number): string {
    // Base64 编码：3 字节 -> 4 字符，所以需要的字节数 = charCount * 3 / 4
    const bytes = Math.ceil((charCount * 3) / 4);
    const buffer = randomBytes(bytes);

    // Base64URL 编码：URL 安全的 Base64
    const base64url = buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // 截断到指定字符数
    return base64url.substring(0, charCount);
  }

  /**
   * 生成邮箱验证码（6 位数字）
   * @returns 6 位数字验证码
   */
  generateEmailCode(): string {
    return this.generateNumericCode(6);
  }

  /**
   * 生成短信验证码（6 位数字）
   * @returns 6 位数字验证码
   */
  generateSmsCode(): string {
    return this.generateNumericCode(6);
  }

  /**
   * 生成邮箱验证令牌（64 字符 Base64URL）
   * @returns 64 字符 Base64URL 令牌
   */
  generateEmailToken(): string {
    return this.generateTokenByChars(64);
  }

  /**
   * 生成密码重置令牌（64 字符 Base64URL）
   * @returns 64 字符 Base64URL 令牌
   */
  generatePasswordResetToken(): string {
    return this.generateTokenByChars(64);
  }

  /**
   * 生成加密安全的数字验证码
   * @param length 验证码长度
   * @returns 数字验证码字符串
   */
  private generateNumericCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  /**
   * 生成加密安全的随机字符串令牌
   * @param length 令牌长度（字节数）
   * @param encoding 编码格式
   * @returns 编码后的令牌字符串
   */
  private generateTokenString(length: number, encoding: 'hex' | 'base64url'): string {
    const buffer = randomBytes(length);

    if (encoding === 'hex') {
      return buffer.toString('hex');
    }

    // Base64URL 编码：URL 安全的 Base64
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
