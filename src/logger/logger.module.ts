// src/logger/logger.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule,
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          pinoHttp: {
            level: configService.get<string>('logger.level', 'info'),
            transport: configService.get('logger.transport'),
            redact: configService.get<string[]>('logger.redactFields', []),
            // 修正类型定义：customProps 是一个函数，不是字符串数组
            customProps: configService.get('logger.customProps'),
            customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => {
              // 忽略 favicon 请求
              if (req.url === '/favicon.ico') return 'silent';

              // 正常的日志记录逻辑
              if (res.statusCode >= 500 || err) return 'error';
              if (res.statusCode >= 400) return 'warn';
              if (res.statusCode > 200) return 'warn';

              // 只记录你允许的 /graphql POST 相关 200 状态日志
              if (res.statusCode === 200 && req.method === 'POST' && req.url === '/graphql') {
                return 'info'; // 正常记录
              }

              // 默认阻止 /graphql GET 相关的 200 状态日志，但保留次分支用于将来开放特殊情况
              if (res.statusCode === 200 && req.method === 'GET' && req.url === '/graphql') {
                return 'silent'; // 屏蔽
              }
              return 'silent';
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
