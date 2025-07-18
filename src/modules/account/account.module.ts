// src/modules/account/account.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountResolver } from './account.resolver';
import { AccountService } from './account.service';
import { AccountEntity } from './entities/account.entity';

/**
 * 账户模块
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [AccountResolver, AccountService],
  exports: [AccountService],
})
export class AccountModule {}
