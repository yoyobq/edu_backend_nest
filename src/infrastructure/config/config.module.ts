// src/infrastructure/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from '@core/config/database.config';
import graphqlConfig from '@core/config/graphql.config';
import jwtConfig from '@core/config/jwt.config';
import loggerConfig from '@core/config/logger.config';
import paginationConfig from '@core/config/pagination.config';
import serverConfig from '@core/config/server.config';

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
