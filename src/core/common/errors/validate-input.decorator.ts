// src/core/common/decorators/validate-input.decorator.ts

import { BadRequestException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { formatValidationErrors } from './validation.formatter';

/**
 * 输入验证装饰器
 * 为 GraphQL resolver 方法提供标准的输入验证，并返回详细的错误消息
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ValidateInput = () =>
  UsePipes(
    new ValidationPipe({
      whitelist: true, // 自动移除非装饰器属性
      forbidNonWhitelisted: true, // 当遇到非白名单属性时抛出错误
      transform: true, // 自动转换类型
      disableErrorMessages: false, // 显示详细错误信息
      stopAtFirstError: false, // 显示所有验证错误
      validationError: {
        target: false, // 不在错误中包含目标对象
        value: false, // 不在错误中包含值
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const message = formatValidationErrors(errors);
        return new BadRequestException(message);
      },
    }),
  );
