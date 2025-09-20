// src/modules/auth/auth.module.ts

import { TokenHelper } from '@core/common/token/token.helper';
import { CoreJwtModule } from '@core/jwt/jwt.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
// 添加 usecase 导入
import { DecideLoginRoleUsecase } from '@usecases/auth/decide-login-role.usecase';
import { EnrichLoginWithIdentityUsecase } from '@usecases/auth/enrich-login-with-identity.usecase';
import { ExecuteLoginFlowUsecase } from '@usecases/auth/execute-login-flow.usecase';
import { LoginByAccountIdUsecase } from '@usecases/auth/login-by-account-id.usecase';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { LoginWithThirdPartyUsecase } from '@usecases/auth/login-with-third-party.usecase';

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
  providers: [
    AuthService,
    TokenHelper,
    JwtStrategy,
    LoginWithPasswordUsecase,
    // ValidateLoginUsecase, // 删除这行
    ExecuteLoginFlowUsecase,
    LoginByAccountIdUsecase,
    LoginWithThirdPartyUsecase,
    // 添加缺失的 usecase providers
    DecideLoginRoleUsecase,
    EnrichLoginWithIdentityUsecase,
  ],
  exports: [
    AuthService,
    JwtStrategy,
    // 导出 usecases 供 GraphQLAdapterModule 使用
    LoginWithPasswordUsecase,
    // ValidateLoginUsecase, // 删除这行
    ExecuteLoginFlowUsecase,
    LoginByAccountIdUsecase,
    LoginWithThirdPartyUsecase,
    // 导出新添加的 usecases
    DecideLoginRoleUsecase,
    EnrichLoginWithIdentityUsecase,
  ],
})
export class AuthModule {}
