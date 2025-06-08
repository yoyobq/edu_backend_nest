import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        ({
          autoSchemaFile: config.get<string>('graphql.schemaDestination'),
          introspection: config.get<boolean>('graphql.introspection'),
          playground: config.get<boolean>('graphql.playground'),
          sortSchema: config.get<boolean>('graphql.sortSchema'),
          subscriptions: config.get('graphql.subscriptions'),
          plugins: [ApolloServerPluginLandingPageLocalDefault()],
        }) satisfies ApolloDriverConfig,
    }),
    CatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
