// src/modules/auth/auth.module.ts

import { TokenHelper } from '@core/common/token/token.helper';
import { CoreJwtModule } from '@core/jwt/jwt.module';
import { AccountModule } from '@modules/account/account.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import '@src/adapters/graphql/account/enums/login-history.types';
import { AuthResolver } from '../../adapters/graphql/auth/auth.resolver';
import '../../adapters/graphql/auth/enums/audience-type.enum';
import '../../adapters/graphql/auth/enums/login-type.enum';
import { JwtAuthGuard } from '../../adapters/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
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
