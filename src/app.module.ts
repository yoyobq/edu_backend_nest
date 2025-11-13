// src/app.module.ts

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLAdapterModule } from './adapters/graphql/graphql-adapter.module';
import { IntegrationEventsModule } from './modules/common/integration-events/integration-events.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { GqlAllExceptionsFilter } from './core/common/filters/graphql-exception.filter';
import { PasswordModule } from './core/common/password/password.module';
import { AppConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { FieldEncryptionModule } from './core/field-encryption/field-encryption.module';
import { AppGraphQLModule } from './core/graphql/graphql.module';
import { LoggerModule } from './core/logger/logger.module';
import { MiddlewareModule } from './core/middleware/middleware.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { RegisterModule } from './modules/register/register.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule,
    DatabaseModule,
    AppGraphQLModule,
    FieldEncryptionModule,
    PasswordModule, // 全局导入 PasswordModule 确保 PasswordPolicyService 在 E2E 测试中可用
    CatsModule,
    AccountModule,
    AuthModule,
    RegisterModule,
    // 添加 GraphQL 适配器模块
    GraphQLAdapterModule,
    // 集成事件模块（内存 Outbox + 调度器）
    IntegrationEventsModule,
    // ThirdPartyAuthModule, // 暂时屏蔽第三方认证模块
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GqlAllExceptionsFilter,
    },
  ],
})
export class AppModule {}
