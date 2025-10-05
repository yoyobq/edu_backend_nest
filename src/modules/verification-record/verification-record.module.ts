// src/modules/verification-record/verification-record.module.ts

import { PasswordModule } from '@core/common/password/password.module';
import { VerificationCodeHelper } from '@core/common/token/verification-code.helper';
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import { CreateVerificationRecordUsecase } from '@src/usecases/verification-record/create-verification-record.usecase';
import { FindVerificationRecordUsecase } from '@src/usecases/verification-record/find-verification-record.usecase';
import { InviteCoachHandler } from '@src/usecases/verification/coach/invite-coach.handler';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { AcceptInviteCoachUsecase } from '@src/usecases/verification/invite/accept-invite-coach.usecase';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';
import { ResetPasswordUsecase } from '@src/usecases/verification/password/reset-password.usecase';
import { VerificationRecordReadRepository } from './repositories/verification-record.read.repo';
import { VerificationFlowInitializerService } from './services/verification-flow-initializer.service';
import { VerificationReadService } from './services/verification-read.service';
import { VerificationRecordEntity } from './verification-record.entity';
import { VerificationRecordService } from './verification-record.service';

/**
 * 验证记录模块
 * 提供统一的验证/邀请记录管理功能
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([VerificationRecordEntity]),
    AccountInstallerModule, // 导入 AccountInstallerModule 以提供 AccountService
    PasswordModule, // 导入 PasswordModule 以提供 PasswordPolicyService
    CoachServiceModule, // 导入 CoachServiceModule 以提供 CoachService
  ],
  providers: [
    VerificationRecordService,
    VerificationRecordReadRepository,
    VerificationReadService,
    VerificationCodeHelper,
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
    // 验证流程相关
    ConsumeVerificationFlowUsecase,
    ResetPasswordUsecase,
    ResetPasswordHandler,
    InviteCoachHandler,
    AcceptInviteCoachUsecase,
    VerificationFlowInitializerService,
  ],
  exports: [
    TypeOrmModule,
    VerificationRecordService,
    VerificationRecordReadRepository,
    VerificationReadService,
    VerificationCodeHelper,
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
    // 验证流程相关
    ConsumeVerificationFlowUsecase,
    ResetPasswordUsecase,
    ResetPasswordHandler,
  ],
})
export class VerificationRecordModule {}
