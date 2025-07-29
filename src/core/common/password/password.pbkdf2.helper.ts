// /var/www/backend/src/core/common/password/password.pbkdf2.helper.ts
import { pbkdf2Sync } from 'crypto';
// import * as CryptoJS from 'crypto-js';

/**
 * PBKDF2 密码哈希工具类
 * 提供与老系统兼容的密码哈希功能
 */
export class PasswordPbkdf2Helper {
  /**
   * 根据传入的密码和盐值生成哈希字符串（Node.js crypto 版本）
   * 使用 Node.js 内置 crypto 模块实现相同的算法
   * @param password - 用户的密码
   * @param salt - 用于加密的盐值
   * @returns 返回加密后的哈希字符串
   */
  static hashPasswordWithCrypto(password: string, salt: string): string {
    // 5000 次迭代，64 字节输出长度，SHA-256 算法
    const hash = pbkdf2Sync(password, salt, 5000, 64, 'sha256').toString('hex');
    return hash;
  }

  /**
   * 验证密码是否正确（使用 Node.js crypto 版本）
   * @param password - 待验证的密码
   * @param salt - 盐值
   * @param hashedPassword - 已存储的哈希密码
   * @returns 密码是否匹配
   */
  static verifyPasswordWithCrypto(password: string, salt: string, hashedPassword: string): boolean {
    const hash = this.hashPasswordWithCrypto(password, salt);
    return hash === hashedPassword;
  }

  /**
   * 根据传入的密码和盐值生成哈希字符串（CryptoJS 版本）
   * 完全复刻老系统的 CryptoJS.PBKDF2 实现
   * @param password - 用户的密码
   * @param salt - 用于加密的盐值
   * @returns 返回加密后的哈希字符串
   */
  // static hashPassword(password: string, salt: string): string {
  //   // 使用与老系统完全相同的 CryptoJS.PBKDF2 实现
  //   const saltStr = salt.toString();
  //   const hash = CryptoJS.PBKDF2(password, saltStr, {
  //     keySize: 64 / 4, // 64 字节等于 512 位，而 keySize 以 32 位字为单位，64 字节等于 16 个字
  //     iterations: 5000,
  //     hasher: CryptoJS.algo.SHA256,
  //   }).toString(CryptoJS.enc.Hex);
  //   return hash;
  // }
}
