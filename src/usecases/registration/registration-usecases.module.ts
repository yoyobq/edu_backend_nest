import { RegisterModule } from '@modules/register/register.module';
import { Module } from '@nestjs/common';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { RegisterWithEmailUsecase } from '@src/usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@src/usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@src/usecases/registration/weapp-register.usecase';
import { VerificationUsecasesModule } from '@src/usecases/verification/verification-usecases.module';

@Module({
  imports: [RegisterModule, VerificationUsecasesModule],
  providers: [
    CreateAccountUsecase,
    RegisterWithEmailUsecase,
    RegisterWithThirdPartyUsecase,
    WeappRegisterUsecase,
  ],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase, WeappRegisterUsecase],
})
export class RegistrationUsecasesModule {}
