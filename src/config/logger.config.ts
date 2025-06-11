// src/config/logger.config.ts
import { ConfigFactory } from '@nestjs/config';
import { Request, Response } from 'express';

const loggerConfig: ConfigFactory = () => {
  const isDev = process.env.NODE_ENV !== 'production';
  // 实际上 ./logs 并不会被用到，因为 dev 环境不要求输出 log，但保留配置待用
  const logPath = isDev ? './logs' : '/var/log/backend';

  return {
    logger: {
      level: isDev ? 'debug' : 'info',
      redactFields: ['req.headers.authorization'],
      file: {
        enabled: !isDev,
        path: logPath,
      },
      // 不自动展开 req/res，但允许你手动 logger.debug({ req, res }, ...)
      customProps: (req: Request, res: Response) => ({
        method: req.method,
        url: req.url,
        // userAgent: req.headers['user-agent'],
        // response: res,
        statusCode: res.statusCode,
      }),
      // 动态生成 transport 配置
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'dd HH:MM:ss',
              messageFormat: '{time} - [{context}] {msg}',
              ignore: 'pid,req',
              // 简洁输出, 完全屏蔽上下文的输出
              hideObject: false,
            },
          }
        : {
            targets: [
              {
                target: 'pino/file',
                options: {
                  destination: `${logPath}/app.log`,
                  mkdir: true,
                },
                level: 'info',
              },
              {
                target: 'pino/file',
                options: {
                  destination: `${logPath}/error.log`,
                  mkdir: true,
                },
                level: 'error',
              },
            ],
          },
    },
  };
};

export default loggerConfig;
