// src/core/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './database.config'; // 添加数据库配置导入
import graphqlConfig from './graphql.config';
import jwtConfig from './jwt.config';
import loggerConfig from './logger.config';
import serverConfig from './server.config';
import paginationConfig from './pagination.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 使 ConfigService 全局可用（无需再次 import）
      envFilePath: [
        `env/.env.${process.env.NODE_ENV || 'development'}`,
        'env/.env.development', // 备用文件
      ],
      load: [
        graphqlConfig,
        serverConfig,
        loggerConfig,
        databaseConfig,
        jwtConfig,
        paginationConfig,
      ],
    }),
  ],
})
export class AppConfigModule {}
