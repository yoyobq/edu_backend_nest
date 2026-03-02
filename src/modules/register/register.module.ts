// src/modules/register/register.module.ts

import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { PasswordModule } from '@core/common/password/password.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    // ✅ 正确：使用 forRoot() 方法导入动态模块
    AccountInstallerModule, // 使用默认配置：{ preset: 'custom', identities: [] }
    ThirdPartyAuthModule,
    PasswordModule, // 导入 PasswordModule 以提供 PasswordPolicyService
  ],
})
export class RegisterModule {}
