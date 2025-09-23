// src/modules/verification-record/verification-record.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationRecordEntity } from './verification-record.entity';

/**
 * 验证记录模块
 * 提供统一的验证/邀请记录管理功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([VerificationRecordEntity])],
  exports: [TypeOrmModule],
})
export class VerificationRecordModule {}
