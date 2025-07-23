// src/modules/account/account.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountService } from './account.service';
import { AccountEntity } from './entities/account.entity';

/**
 * 账户模块
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [AccountService],
  exports: [AccountService, TypeOrmModule], // 导出 TypeOrmModule 供 auth 模块使用
})
export class AccountModule {}
