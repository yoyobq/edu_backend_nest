// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TokenHelper } from '../../core/common/token/token.helper';
import { CoreJwtModule } from '../../core/jwt/jwt.module';
import { AccountModule } from '../account/account.module';
import '../account/graphql/types/login-history.types';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import './graphql/enums/login-type.enum';
import './graphql/enums/audience-type.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * 认证模块
 */
@Module({
  imports: [AccountModule, CoreJwtModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [AuthResolver, AuthService, TokenHelper, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
