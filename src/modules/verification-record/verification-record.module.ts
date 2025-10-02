// src/modules/verification-record/verification-record.module.ts

import { VerificationCodeHelper } from '@core/common/token/verification-code.helper';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import { CreateVerificationRecordUsecase } from '@src/usecases/verification-record/create-verification-record.usecase';
import { FindVerificationRecordUsecase } from '@src/usecases/verification-record/find-verification-record.usecase';
import { VerificationRecordEntity } from './verification-record.entity';
import { VerificationRecordService } from './verification-record.service';

/**
 * 验证记录模块
 * 提供统一的验证/邀请记录管理功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([VerificationRecordEntity])],
  providers: [
    VerificationRecordService,
    VerificationCodeHelper,
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
  ],
  exports: [
    TypeOrmModule,
    VerificationRecordService,
    VerificationCodeHelper,
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
  ],
})
export class VerificationRecordModule {}
