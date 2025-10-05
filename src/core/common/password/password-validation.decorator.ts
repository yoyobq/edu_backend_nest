// src/core/common/password/password-validation.decorator.ts

import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PasswordPolicyService } from './password-policy.service';

/**
 * 密码策略验证约束类
 * 使用依赖注入的方式获取 PasswordPolicyService
 */
@ValidatorConstraint({ name: 'isValidPassword', async: false })
@Injectable()
export class IsValidPasswordConstraint implements ValidatorConstraintInterface {
  constructor(private readonly passwordPolicyService: PasswordPolicyService) {}

  /**
   * 验证密码是否符合策略要求
   */
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const result = this.passwordPolicyService.validatePassword(value);
    return result.isValid;
  }

  /**
   * 生成默认错误消息
   */
  defaultMessage(args: ValidationArguments): string {
    if (typeof args.value !== 'string') {
      return '密码必须是字符串';
    }

    const result = this.passwordPolicyService.validatePassword(args.value);

    if (!result.isValid) {
      return `密码不符合安全要求: ${result.errors.join(', ')}`;
    }

    return '密码验证失败';
  }
}

/**
 * 密码策略验证装饰器
 * 使用统一的密码策略进行验证
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function IsValidPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPasswordConstraint,
    });
  };
}
