// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountModule } from '../account/account.module';
import '../account/graphql/types/login-history.types';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

/**
 * 认证模块
 */
@Module({
  imports: [AccountModule, JwtModule],
  providers: [AuthResolver, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
