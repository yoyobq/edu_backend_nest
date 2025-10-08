import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { initGraphQLSchema } from '@src/adapters/graphql/schema/schema.init';

/**
 * 应用程序启动函数
 * 使用 NestJS ConfigService 获取配置信息
 */
async function bootstrap() {
  // 在 NestFactory.create 之前初始化 GraphQL Schema
  // 确保所有枚举类型在 Nest 应用启动前已注册
  const schemaResult = initGraphQLSchema();

  const app = await NestFactory.create(AppModule);

  // 启用 class-validator 的依赖注入支持
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  // 获取 ConfigService 实例
  const configService = app.get<ConfigService>(ConfigService);

  // 获取 PinoLogger 实例
  const logger = app.get(Logger);

  // 记录 GraphQL Schema 初始化信息到 Pino 日志
  logger.debug(
    {
      fingerprint: schemaResult.fingerprint,
      enumCount: schemaResult.enums.length,
      scalarCount: schemaResult.scalars.length,
      totalTypes: schemaResult.enums.length + schemaResult.scalars.length,
    },
    'GraphQL Schema 已初始化',
  );

  // 从配置服务中获取服务器配置
  const host = configService.get<string>('server.host', '127.0.0.1');
  const port = configService.get<number>('server.port', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  await app.listen(port, host);

  // 使用 PinoLogger 记录服务器启动信息
  logger.log(`🚀 NestJS 服务在 http://${host}:${port} 上以 ${nodeEnv} 模式启动成功`);
}

void bootstrap();
