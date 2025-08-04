// src/core/common/errors/validation.formatter.ts

import { ValidationError } from 'class-validator';

/**
 * 格式化验证错误消息
 * @param errors 验证错误数组
 * @returns 格式化后的错误消息
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];

  errors.forEach((error) => {
    if (error.constraints) {
      // 获取所有约束的错误消息
      Object.values(error.constraints).forEach((message) => {
        messages.push(message);
      });
    }

    // 处理嵌套验证错误
    if (error.children && error.children.length > 0) {
      const childMessages = formatValidationErrors(error.children);
      messages.push(childMessages);
    }
  });

  return messages.join('; ');
}
