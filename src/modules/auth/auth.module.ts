// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccountModule } from '../account/account.module';
import '../account/graphql/types/login-history.types';
import { TokenHelper } from '../common/token/token.helper';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * 认证模块
 */
@Module({
  imports: [AccountModule, JwtModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [AuthResolver, AuthService, TokenHelper, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
