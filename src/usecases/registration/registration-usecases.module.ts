import { Module } from '@nestjs/common';
import { RegisterModule } from '@modules/register/register.module';
import { RegisterWithEmailUsecase } from '@src/usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@src/usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@src/usecases/registration/weapp-register.usecase';

@Module({
  imports: [RegisterModule],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase, WeappRegisterUsecase],
})
export class RegistrationUsecasesModule {}
