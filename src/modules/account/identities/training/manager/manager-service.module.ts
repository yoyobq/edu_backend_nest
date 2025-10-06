// src/modules/account/identities/training/manager/manager-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerEntity } from './account-manager.entity';
import { ManagerService } from './manager.service';

/**
 * Manager Service 模块
 * 专门导出 ManagerService 供其他模块使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([ManagerEntity])],
  providers: [ManagerService],
  exports: [ManagerService],
})
export class ManagerServiceModule {}
