// 文件位置： src/usecases/verification/verification-usecases.module.ts
import { PasswordModule } from '@modules/common/password/password.module';
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { ManagerServiceModule } from '@modules/account/identities/training/manager/manager-service.module';
import { Module } from '@nestjs/common';
import { VerificationRecordModule } from '@src/modules/verification-record/verification-record.module';
import { InviteCoachHandler } from '@src/usecases/verification/coach/invite-coach.handler';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { AcceptInviteCoachUsecase } from '@src/usecases/verification/invite/accept-invite-coach.usecase';
import { AcceptInviteManagerUsecase } from '@src/usecases/verification/invite/accept-invite-manager.usecase';
import { InviteManagerHandler } from '@src/usecases/verification/manager/invite-manager.handler';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';
import { ResetPasswordUsecase } from '@src/usecases/verification/password/reset-password.usecase';

@Module({
  imports: [
    VerificationRecordModule,
    AccountInstallerModule,
    PasswordModule,
    CoachServiceModule,
    ManagerServiceModule,
  ],
  providers: [
    ConsumeVerificationFlowUsecase,
    ResetPasswordUsecase,
    ResetPasswordHandler,
    InviteCoachHandler,
    AcceptInviteCoachUsecase,
    InviteManagerHandler,
    AcceptInviteManagerUsecase,
  ],
  exports: [ConsumeVerificationFlowUsecase],
})
export class VerificationUsecasesModule {}
