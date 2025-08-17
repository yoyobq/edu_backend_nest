// src/modules/register/register.module.ts

import { AccountModule } from '@modules/account/account.module';
import { Module } from '@nestjs/common';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { RegisterWithEmailUsecase } from '@usecases/registration/register-with-email.usecase';

@Module({
  imports: [AccountModule],
  providers: [CreateAccountUsecase, RegisterWithEmailUsecase],
  exports: [RegisterWithEmailUsecase],
})
export class RegisterModule {}
