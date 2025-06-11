// src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import graphqlConfig from './graphql.config';
import serverConfig from './server.config';
import loggerConfig from './logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 使 ConfigService 全局可用（无需再次 import）
      envFilePath: [
        `env/.env.${process.env.NODE_ENV || 'development'}`,
        'env/.env.development', // 备用文件
      ],
      load: [graphqlConfig, serverConfig, loggerConfig], // 加载模块级配置
    }),
  ],
})
export class AppConfigModule {}
