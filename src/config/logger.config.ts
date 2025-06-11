// src/config/logger.config.ts
import { ConfigFactory } from '@nestjs/config';

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
      // 动态生成 transport 配置
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'dd HH:MM:ss',
              messageFormat: '{time} - [{context}] {msg}',
              ignore: 'pid,hostname',
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
