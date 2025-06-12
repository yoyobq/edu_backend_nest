import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatsModule } from './cats/cats.module';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    // TypeORM MariaDB 配置
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: config.get<'mariadb'>('mariadb.type'),
        host: config.get<string>('mariadb.host'),
        port: config.get<number>('mariadb.port'),
        username: config.get<string>('mariadb.username'),
        password: config.get<string>('mariadb.password'),
        database: config.get<string>('mariadb.database'),
        timezone: config.get<string>('mariadb.timezone'),
        synchronize: config.get<boolean>('mariadb.synchronize'),
        logging: config.get<boolean>('mariadb.logging'),
        extra: config.get('mariadb.extra'),
        // 自动加载 entities
        autoLoadEntities: true,
        // 实体文件路径
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
      }),
    }),
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
