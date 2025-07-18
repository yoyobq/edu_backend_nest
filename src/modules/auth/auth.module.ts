// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/entities/account.entity';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

/**
 * 认证模块
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [AuthResolver, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
