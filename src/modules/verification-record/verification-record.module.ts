// src/modules/verification-record/verification-record.module.ts

import { VerificationCodeHelper } from '@core/common/token/verification-code.helper';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { ResetPasswordUsecase } from '@src/usecases/verification/password/reset-password.usecase';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import { CreateVerificationRecordUsecase } from '@src/usecases/verification-record/create-verification-record.usecase';
import { FindVerificationRecordUsecase } from '@src/usecases/verification-record/find-verification-record.usecase';
import { VerificationRecordReadRepository } from './repositories/verification-record.read.repo';
import { VerificationReadService } from './services/verification-read.service';
import { VerificationFlowInitializerService } from './services/verification-flow-initializer.service';
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
