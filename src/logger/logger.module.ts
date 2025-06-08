// src/logger/logger.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
  // 导入 Pino 日志模块，并通过 forRootAsync 异步加载配置（从 ConfigService 读取）
  imports: [
    ConfigModule, // 确保能读取 config 下的配置
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService], // 注入 ConfigService
      useFactory: (configService: ConfigService) => {
        const isProd = process.env.NODE_ENV === 'production';

        return {
          pinoHttp: {
            // 是否启用 prettifier（开发环境友好）
            transport: isProd
              ? undefined // 生产环境禁用 prettifier，直接输出 JSON
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'dd HH:MM:ss',
                    // singleLine: true,
                    messageFormat: 'id={req.id} {req.url} {res.statusCode} - {responseTime}ms',
                  },
                },

            // 自动屏蔽敏感字段
            redact: configService.get<string[]>('logger.redactFields', []),

            // 自定义日志请求上下文结构（可选）
            // customProps: (req) => ({
            //   ip: req.ip || 'anonymous',
            // }),

            // 自定义请求日志输出内容
            customLogLevel: (req, res, err) => {
              if (req.url === '/favicon.ico') return 'silent';
              if (res.statusCode >= 500 || err) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'silent';
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
