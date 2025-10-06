// src/modules/register/register.module.ts

import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { VerificationRecordModule } from '@modules/verification-record/verification-record.module';
import { PasswordModule } from '@core/common/password/password.module';
import { Module } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@usecases/registration/weapp-register.usecase';

@Module({
  imports: [
    // ✅ 正确：使用 forRoot() 方法导入动态模块
    AccountInstallerModule, // 使用默认配置：{ preset: 'custom', identities: [] }
    ThirdPartyAuthModule,
    PasswordModule, // 导入 PasswordModule 以提供 PasswordPolicyService
    VerificationRecordModule, // 导入 VerificationRecordModule 以提供 ConsumeVerificationFlowUsecase
  ],
  providers: [
    CreateAccountUsecase,
    RegisterWithEmailUsecase,
    RegisterWithThirdPartyUsecase,
    WeappRegisterUsecase,
  ],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase],
})
export class RegisterModule {}
