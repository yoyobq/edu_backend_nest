// src/adapters/graphql/graphql-adapter.module.ts

import { AccountModule } from '@modules/account/account.module';
import { AuthModule } from '@modules/auth/auth.module';
import { RegisterModule } from '@modules/register/register.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';

// Resolvers
import { AccountResolver } from './account/account.resolver';
import { AuthResolver } from './auth/auth.resolver';
import { RegistrationResolver } from './registration/registration.resolver';
import { ThirdPartyAuthResolver } from './third-party-auth/third-party-auth.resolver';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * GraphQL 适配器模块
 * 统一管理所有 GraphQL Resolvers 和相关的 Guards，遵循适配器层架构原则
 */
@Module({
  imports: [
    // 导入业务模块以获取服务
    AccountModule,
    AuthModule,
    RegisterModule,
    ThirdPartyAuthModule,
  ],
  providers: [
    // 注册所有 GraphQL Resolvers
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    // 注册 GraphQL 相关的 Guards
    JwtAuthGuard,
  ],
  exports: [
    // 导出 resolvers 和 guards 供 AppModule 使用
    AccountResolver,
    AuthResolver,
    RegistrationResolver,
    ThirdPartyAuthResolver,
    JwtAuthGuard,
  ],
})
export class GraphQLAdapterModule {}
