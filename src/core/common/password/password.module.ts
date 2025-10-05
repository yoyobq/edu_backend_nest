// src/core/common/password/password.module.ts

import { Module } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { IsValidPasswordConstraint } from './password-validation.decorator';

/**
 * 密码策略模块
 * 提供统一的密码复杂度校验和安全策略
 */
@Module({
  providers: [PasswordPolicyService, IsValidPasswordConstraint],
  exports: [PasswordPolicyService, IsValidPasswordConstraint],
})
export class PasswordModule {}
