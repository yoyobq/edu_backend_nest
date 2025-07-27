// src/app.module.ts

import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Algorithm } from 'jsonwebtoken';
import { PinoLogger } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { AppConfigModule } from './core/config/config.module';
import { LoggerModule } from './core/logger/logger.module';
import { MiddlewareModule } from './core/middleware/middleware.module';
import { AccountModule } from './modules/account/account.module';
import { AuthModule } from './modules/auth/auth.module';
import { EncryptionModule } from './modules/common/encryption/encryption.module';
import { ThirdPartyAuthModule } from './modules/thirdPartyAuth/third-party-auth.module';
// import { FormatResponseMiddleware } from './middleware/format-response.middleware';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    MiddlewareModule, // 添加中间件模块
    // JWT 配置
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn'),
          algorithm: config.get<string>('jwt.algorithm') as Algorithm,
          issuer: config.get<string>('jwt.issuer'),
          audience: config.get<string>('jwt.audience'),
        },
      }),
    }),

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
        // entities: [__dirname + '/**/*.entity{.ts,.js}'],
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
    EncryptionModule,
    CatsModule,
    AccountModule,
    AuthModule,
    ThirdPartyAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
