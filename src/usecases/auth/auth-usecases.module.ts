import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DecideLoginRoleUsecase } from '@src/usecases/auth/decide-login-role.usecase';
import { EnrichLoginWithIdentityUsecase } from '@src/usecases/auth/enrich-login-with-identity.usecase';
import { ExecuteLoginFlowUsecase } from '@src/usecases/auth/execute-login-flow.usecase';
import { LoginByAccountIdUsecase } from '@src/usecases/auth/login-by-account-id.usecase';
import { LoginWithPasswordUsecase } from '@src/usecases/auth/login-with-password.usecase';
import { LoginWithThirdPartyUsecase } from '@src/usecases/auth/login-with-third-party.usecase';

@Module({
  imports: [AuthModule],
  exports: [
    LoginWithPasswordUsecase,
    ExecuteLoginFlowUsecase,
    LoginByAccountIdUsecase,
    LoginWithThirdPartyUsecase,
    DecideLoginRoleUsecase,
    EnrichLoginWithIdentityUsecase,
  ],
})
export class AuthUsecasesModule {}
