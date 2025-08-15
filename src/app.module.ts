// src/app.module.ts

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { GqlAllExceptionsFilter } from './core/common/filters/graphql-exception.filter';
import { AppConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { FieldEncryptionModule } from './core/field-encryption/field-encryption.module';
import { AppGraphQLModule } from './core/graphql/graphql.module';
import { LoggerModule } from './core/logger/logger.module';
import { MiddlewareModule } from './core/middleware/middleware.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { RegisterModule } from './modules/register/register.module';
import { ThirdPartyAuthModule } from './modules/third-party-auth/third-party-auth.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule, // 添加中间件模块
    DatabaseModule,
    AppGraphQLModule, // 使用独立的 GraphQL 模块
    FieldEncryptionModule, // 使用新的字段加密模块
    CatsModule,
    AccountModule,
    AuthModule,
    RegisterModule, // 添加 RegisterModule
    ThirdPartyAuthModule,
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
