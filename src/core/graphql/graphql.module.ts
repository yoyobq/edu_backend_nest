// src/core/graphql/graphql.module.ts

import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { PinoLogger } from 'nestjs-pino';

/**
 * GraphQL 配置工厂函数
 * @param config 配置服务实例
 * @returns Apollo GraphQL 配置选项
 */
const createGraphQLConfig = (config: ConfigService): ApolloDriverConfig => ({
  autoSchemaFile: config.get<string>('graphql.schemaDestination'),
  introspection: config.get<boolean>('graphql.introspection'),
  playground: config.get<boolean>('graphql.playground'),
  sortSchema: config.get<boolean>('graphql.sortSchema'),
  subscriptions: config.get('graphql.subscriptions'),
  plugins: [ApolloServerPluginLandingPageLocalDefault()],
});

/**
 * GraphQL 模块
 * 封装 GraphQL 配置和初始化逻辑
 */
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService, PinoLogger],
      useFactory: createGraphQLConfig,
    }),
  ],
  exports: [GraphQLModule],
})
export class AppGraphQLModule {}
