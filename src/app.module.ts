// src/app.module.ts

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLAdapterModule } from './adapters/api/graphql/graphql-adapter.module';
import { IntegrationEventsAdapterModule } from './adapters/api/integration-events/integration-events-adapter.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GqlAllExceptionsFilter } from './infrastructure/graphql/filters/graphql-exception.filter';
import { PasswordModule } from './modules/common/password/password.module';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { FieldEncryptionModule } from './infrastructure/field-encryption/field-encryption.module';
import { AppGraphQLModule } from './infrastructure/graphql/graphql.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { MiddlewareModule } from './infrastructure/middleware/middleware.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { IntegrationEventsModule } from './modules/common/integration-events/integration-events.module';
import { RegisterModule } from './modules/register/register.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule,
    DatabaseModule,
    AppGraphQLModule,
    GraphQLAdapterModule,
    FieldEncryptionModule,
    PasswordModule, // 全局导入 PasswordModule 确保 PasswordPolicyService 在 E2E 测试中可用
    AccountModule,
    AuthModule,
    RegisterModule,
    // 集成事件模块（内存 Outbox）
    IntegrationEventsModule,
    // 集成事件适配器（调度器 + 处理器）
    IntegrationEventsAdapterModule,
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
