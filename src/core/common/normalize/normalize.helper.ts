// src/core/common/normalize.helper.ts

/**
 * 邮箱标准化处理
 * 统一的邮箱标准化逻辑：去除首尾空格 + 转小写
 * @param email 原始邮箱地址
 * @returns 标准化后的邮箱地址
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 手机号标准化处理
 * 统一的手机号标准化逻辑：仅保留数字字符
 * @param phone 原始手机号
 * @returns 标准化后的手机号（仅包含数字）
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * 通用标准化处理器
 * 根据类型自动选择合适的标准化方法
 * @param value 待标准化的值
 * @param type 标准化类型
 * @returns 标准化后的值
 */
export function normalize(value: string, type: 'email' | 'phone'): string {
  switch (type) {
    case 'email':
      return normalizeEmail(value);
    case 'phone':
      return normalizePhone(value);
    default: {
      // TypeScript 会确保这里不会被执行到
      const exhaustiveCheck: never = type;
      throw new Error(`不支持的标准化类型: ${String(exhaustiveCheck)}`);
    }
  }
}
