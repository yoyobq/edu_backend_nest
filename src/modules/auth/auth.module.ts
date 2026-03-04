// src/modules/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CoreJwtModule } from '@src/infrastructure/jwt/jwt.module';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { AuthService } from './auth.service';
import { LoginBootstrapQueryService } from './queries/login-bootstrap.query.service';
import { LoginResultQueryService } from './queries/login-result.query.service';
import { PermissionQueryService } from './queries/permission.query.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenHelper } from './token.helper';

/**
 * 认证模块
 */
@Module({
  imports: [
    AccountInstallerModule, // 使用动态模块配置
    CoreJwtModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  providers: [
    AuthService,
    TokenHelper,
    JwtStrategy,
    PermissionQueryService,
    LoginBootstrapQueryService,
    LoginResultQueryService,
  ],
  exports: [
    AuthService,
    TokenHelper, // 导出 TokenHelper 供其他模块使用
    JwtStrategy,
    PermissionQueryService,
    LoginBootstrapQueryService,
    LoginResultQueryService,
  ],
})
export class AuthModule {}
