// src/app.module.ts

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { AppConfigModule } from './core/config/config.module';
import { DatabaseModule } from './core/database/database.module';
import { AppGraphQLModule } from './core/graphql/graphql.module';
import { LoggerModule } from './core/logger/logger.module';
import { MiddlewareModule } from './core/middleware/middleware.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { EncryptionModule } from './modules/common/encryption/encryption.module';
import { RegisterModule } from './modules/register/register.module';
import { ThirdPartyAuthModule } from './modules/thirdPartyAuth/third-party-auth.module';
import { GqlAllExceptionsFilter } from './core/common/filters/graphql-exception.filter';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule, // 添加中间件模块
    DatabaseModule,
    AppGraphQLModule, // 使用独立的 GraphQL 模块
    EncryptionModule,
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
