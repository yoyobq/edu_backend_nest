import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { PasswordModule } from '@modules/common/password/password.module';
import { RegisterModule } from '@modules/register/register.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { RegisterWithEmailUsecase } from '@src/usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@src/usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@src/usecases/registration/weapp-register.usecase';
import { ThirdPartyAccountsUsecasesModule } from '@src/usecases/third-party-accounts/third-party-accounts-usecases.module';
import { VerificationUsecasesModule } from '@src/usecases/verification/verification-usecases.module';

@Module({
  imports: [
    RegisterModule,
    VerificationUsecasesModule,
    AccountInstallerModule,
    PasswordModule,
    ThirdPartyAuthModule,
    ThirdPartyAccountsUsecasesModule,
  ],
  providers: [
    CreateAccountUsecase,
    RegisterWithEmailUsecase,
    RegisterWithThirdPartyUsecase,
    WeappRegisterUsecase,
  ],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase, WeappRegisterUsecase],
})
export class RegistrationUsecasesModule {}
