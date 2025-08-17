// src/modules/auth/auth.module.ts

import { TokenHelper } from '@core/common/token/token.helper';
import { CoreJwtModule } from '@core/jwt/jwt.module';
import { AccountModule } from '@modules/account/account.module';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import '@src/adapters/graphql/account/enums/login-history.types';
import '../../adapters/graphql/auth/enums/audience-type.enum';
import '../../adapters/graphql/auth/enums/login-type.enum';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
// 添加 usecase 导入
import { ValidateLoginUsecase } from '@usecases/account/validate-login.usecase';
import { ExecuteLoginFlowUsecase } from '@usecases/auth/execute-login-flow.usecase';
import { LoginByAccountIdUsecase } from '@usecases/auth/login-by-account-id.usecase';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';

/**
 * 认证模块
 */
@Module({
  imports: [AccountModule, CoreJwtModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    AuthService,
    TokenHelper,
    JwtStrategy,
    LoginWithPasswordUsecase,
    ValidateLoginUsecase,
    ExecuteLoginFlowUsecase,
    LoginByAccountIdUsecase,
  ],
  exports: [
    AuthService,
    JwtStrategy,
    // 导出 usecases 供 GraphQLAdapterModule 使用
    LoginWithPasswordUsecase,
    ValidateLoginUsecase,
    ExecuteLoginFlowUsecase,
    LoginByAccountIdUsecase,
  ],
})
export class AuthModule {}
