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
        const isProd = process.env.NODE_ENV === 'production';
        const logLevel = configService.get<string>('logger.level', 'info');

        return {
          pinoHttp: {
            // 设置日志级别
            level: logLevel,
            // 开发环境使用 pretty 格式，生产环境使用 JSON 格式
            transport: isProd
              ? {
                  targets: [
                    {
                      target: 'pino/file',
                      options: {
                        destination: './logs/app.log',
                        mkdir: true,
                      },
                      level: 'info',
                    },
                    {
                      target: 'pino/file',
                      options: {
                        destination: './logs/error.log',
                        mkdir: true,
                      },
                      level: 'error',
                    },
                  ],
                }
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'yyyy-mm-dd HH:MM:ss',
                    messageFormat: '{levelLabel} - {pid} - {time} - [{context}] {msg}',
                    ignore: 'pid,hostname',
                  },
                },

            // 自动屏蔽敏感字段
            redact: configService.get<string[]>('logger.redactFields', []),

            // 自定义请求日志输出内容
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
