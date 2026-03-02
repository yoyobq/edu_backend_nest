// src/modules/auth/auth.module.ts

import { TokenHelper } from '@core/common/token/token.helper';
import { CoreJwtModule } from '@core/jwt/jwt.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { AuthService } from './auth.service';
import { PermissionQueryService } from './queries/permission.query.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * 认证模块
 */
@Module({
  imports: [
    AccountInstallerModule, // 使用动态模块配置
    CoreJwtModule,
    ThirdPartyAuthModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  providers: [AuthService, TokenHelper, JwtStrategy, PermissionQueryService],
  exports: [
    AuthService,
    TokenHelper, // 导出 TokenHelper 供其他模块使用
    JwtStrategy,
    PermissionQueryService,
  ],
})
export class AuthModule {}
