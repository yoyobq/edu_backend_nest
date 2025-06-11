// src/config/logger.config.ts
import { ConfigFactory } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';

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
      // customProps: (req: Request, res: Response) => ({
      //   method: req.method,
      //   url: req.url,
      // userAgent: req.headers['user-agent'],
      // response: res,
      //   statusCode: res.statusCode,
      // }),
      // 自定义日志级别函数
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
      // 动态生成 transport 配置
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:dd HH:MM:ss',
              messageFormat: '{time} - [{context}] {method} {url} {statusCode} - {msg}',
              ignore: 'hostname,pid,req,context',
              // 简洁输出, 完全屏蔽上下文的输出
              // hideObject: true,
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
