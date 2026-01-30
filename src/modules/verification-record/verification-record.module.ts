// src/modules/verification-record/verification-record.module.ts

import { PasswordModule } from '@core/common/password/password.module';
import { VerificationCodeHelper } from '@core/common/token/verification-code.helper';
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { ManagerServiceModule } from '@modules/account/identities/training/manager/manager-service.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationRecordReadRepository } from './repositories/verification-record.read.repo';
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
    ManagerServiceModule, // 导入 ManagerServiceModule 以提供 ManagerService
  ],
  providers: [
    VerificationRecordService,
    VerificationRecordReadRepository,
    VerificationReadService,
    VerificationCodeHelper,
  ],
  exports: [
    TypeOrmModule,
    VerificationRecordService,
    VerificationRecordReadRepository,
    VerificationReadService,
    VerificationCodeHelper,
  ],
})
export class VerificationRecordModule {}
