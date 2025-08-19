// src/modules/register/register.module.ts

import { AccountModule } from '@modules/account/account.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@usecases/registration/weapp-register.usecase';

@Module({
  imports: [AccountModule, ThirdPartyAuthModule],
  providers: [
    CreateAccountUsecase,
    RegisterWithEmailUsecase,
    RegisterWithThirdPartyUsecase,
    WeappRegisterUsecase,
  ],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase],
})
export class RegisterModule {}
