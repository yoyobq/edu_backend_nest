// src/app.module.ts

import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { FormatResponseMiddleware } from './middleware/format-response.middleware';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    // TypeORM MySQL 8.0 配置
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        type: config.get<'mysql'>('mysql.type'),
        host: config.get<string>('mysql.host'),
        port: config.get<number>('mysql.port'),
        username: config.get<string>('mysql.username'),
        password: config.get<string>('mysql.password'),
        database: config.get<string>('mysql.database'),
        timezone: config.get<string>('mysql.timezone'),
        synchronize: config.get<boolean>('mysql.synchronize'),
        logging: config.get<boolean>('mysql.logging'),
        charset: config.get<string>('mysql.charset'),
        extra: config.get('mysql.extra'),
        // 自动加载 entities
        autoLoadEntities: true,
        // 实体文件路径
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
      }),
    }),
    // GraphQL 配置
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService, PinoLogger],
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(FormatResponseMiddleware) // ✅ 不再用 new，不再用函数包裹
      .forRoutes('*');
  }
}
