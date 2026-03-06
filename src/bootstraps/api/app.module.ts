import { GraphQLAdapterModule } from '@src/adapters/api/graphql/graphql-adapter.module';
import { IntegrationEventsAdapterModule } from '@src/adapters/api/integration-events/integration-events-adapter.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { DatabaseModule } from '@src/infrastructure/database/database.module';
import { FieldEncryptionModule } from '@src/infrastructure/field-encryption/field-encryption.module';
import { GqlAllExceptionsFilter } from '@src/infrastructure/graphql/filters/graphql-exception.filter';
import { AppGraphQLModule } from '@src/infrastructure/graphql/graphql.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { MiddlewareModule } from '@src/infrastructure/middleware/middleware.module';
import { AccountModule } from '@src/modules/account/account.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
import { PasswordModule } from '@src/modules/common/password/password.module';
import { RegisterModule } from '@src/modules/register/register.module';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule,
    DatabaseModule,
    AppGraphQLModule,
    GraphQLAdapterModule,
    FieldEncryptionModule,
    PasswordModule,
    AccountModule,
    AuthModule,
    RegisterModule,
    IntegrationEventsModule,
    IntegrationEventsAdapterModule,
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
