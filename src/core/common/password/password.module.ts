// src/core/common/password/password.module.ts

import { Module } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { IsValidPasswordConstraint } from './password-validation.decorator';

/**
 * 密码模块
 * 提供密码策略验证服务和相关约束
 */
@Module({
  providers: [PasswordPolicyService, IsValidPasswordConstraint],
  exports: [PasswordPolicyService, IsValidPasswordConstraint],
})
export class PasswordModule {}
