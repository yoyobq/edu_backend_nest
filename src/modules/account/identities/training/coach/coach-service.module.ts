// src/modules/account/identities/training/coach/coach-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachEntity } from './account-coach.entity';
import { CoachService } from './coach.service';

/**
 * Coach Service 模块
 * 专门导出 CoachService 供其他模块使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CoachEntity])],
  providers: [CoachService],
  exports: [CoachService],
})
export class CoachServiceModule {}
