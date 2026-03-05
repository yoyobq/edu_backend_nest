// src/infrastructure/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigFactory, ConfigModule, registerAs } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
};

/**
 * 生成 GraphQL 配置
 */
const graphqlConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sandboxEnabled =
    process.env.GRAPHQL_SANDBOX_ENABLED !== undefined
      ? process.env.GRAPHQL_SANDBOX_ENABLED === 'true'
      : !isProduction;

  return {
    graphql: {
      schemaDestination: 'src/schema.graphql',
      introspection: true,
      playground: sandboxEnabled,
      sortSchema: true,
      subscriptions: {
        // graphql-ws 是 Apollo 要求的关键字，不能改名
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'graphql-ws': true,
      },
    },
  };
};

/**
 * 生成 Server 配置
 */
const serverConfig: ConfigFactory = () => ({
  server: {
    host: process.env.APP_HOST || '127.0.0.1',
    port: parseInt(process.env.APP_PORT || '3000', 10),
    cors: {
      enabled: process.env.APP_CORS_ENABLED !== 'false',
      origins: process.env.APP_CORS_ORIGINS || '',
      credentials: process.env.APP_CORS_CREDENTIALS !== 'false',
    },
  },
});

/**
 * 生成日志配置
 */
const buildCustomPropsFor4xx = (
  req: IncomingMessage,
  res: ServerResponse,
): Record<string, unknown> => {
  const statusCode = res.statusCode ?? 0;
  if (statusCode >= 400 && statusCode < 500) {
    const forwardedRaw = req.headers?.['x-forwarded-for'];
    const xForwardedFor = Array.isArray(forwardedRaw) ? forwardedRaw.join(',') : forwardedRaw;
    const userAgentRaw = req.headers?.['user-agent'];
    const userAgent = Array.isArray(userAgentRaw) ? userAgentRaw.join(',') : userAgentRaw;

    const remoteAddress = req.socket?.remoteAddress ?? null;
    const method = req.method ?? null;
    const url = req.url ?? null;
    const originalUrl = (req as unknown as { originalUrl?: string }).originalUrl ?? url;

    return {
      remoteAddress,
      xForwardedFor: xForwardedFor ?? null,
      method,
      url,
      originalUrl,
      userAgent: userAgent ?? null,
    };
  }
  return {};
};

const buildCustomLogLevel = () => {
  return (req: IncomingMessage, res: ServerResponse, err?: Error) => {
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
  };
};

const buildLoggerTransport = (input: { readonly isDev: boolean; readonly logPath: string }) => {
  if (input.isDev) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:dd HH:MM:ss',
        messageFormat: '{time} - [{context}] {method} {url} {statusCode} - {msg}',
        ignore: 'hostname,pid,req,context',
        // 简洁输出, 完全屏蔽上下文的输出
        // hideObject: true,
      },
    };
  }
  return {
    targets: [
      {
        target: 'pino/file',
        options: {
          destination: `${input.logPath}/app.log`,
          mkdir: true,
        },
        level: 'info',
      },
      {
        target: 'pino/file',
        options: {
          destination: `${input.logPath}/error.log`,
          mkdir: true,
        },
        level: 'error',
      },
    ],
  };
};

const loggerConfig: ConfigFactory = () => {
  const isDev = process.env.NODE_ENV !== 'production';
  const logPath = isDev ? './logs' : '/var/log/backend';
  const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');
  const includeRequestMeta = isDev ? true : process.env.LOG_INCLUDE_REQUEST_META === 'true';

  return {
    logger: {
      level,
      redactFields: ['req.headers.authorization'],
      file: {
        enabled: !isDev,
        path: logPath,
      },
      // 不自动展开 req/res，但允许你手动 logger.debug({ req, res }, ...)
      customProps: includeRequestMeta ? buildCustomPropsFor4xx : undefined,
      // 自定义日志级别函数
      customLogLevel: buildCustomLogLevel(),
      // 动态生成 transport 配置
      transport: buildLoggerTransport({ isDev, logPath }),
    },
  };
};

/**
 * 生成数据库配置
 */
const databaseConfig: ConfigFactory = () => ({
  mysql: {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    timezone: process.env.DB_TIMEZONE || '+08:00',
    // 不根据 Entity 自动修改数据库
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    // MySQL 8.0 特定配置
    charset: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    extra: {
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      // 连接超时时间（毫秒）
      connectTimeout: 60000,
      // 是否等待连接释放
      waitForConnections: true,
      // 等待队列上限，0 为不限制
      queueLimit: 0,
    },
  },
});

/**
 * 生成 JWT 配置
 */
const jwtConfig = registerAs('jwt', () => ({
  // 用于签名 JWT 的密钥（建议走环境变量管理）
  secret: getRequiredEnv('JWT_SECRET'),

  // Access Token 有效期
  expiresIn: process.env.JWT_EXPIRES_IN || '2h',

  // Refresh Token 有效期（如果实现刷新机制）
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // 是否启用 JWT 的加密算法和算法选项（可选）
  algorithm: process.env.JWT_ALGORITHM || 'HS256',

  // 是否允许自动刷新（自定义业务用）
  enableRefresh: process.env.JWT_ENABLE_REFRESH === 'true',

  // 允许的 issuer、audience 等（更严格控制）
  issuer: process.env.JWT_ISSUER || 'ssts-local',
  audience: process.env.JWT_AUDIENCE || 'DESKTOP,SSTSTEST,SSTSWEB,SSTSWEAPP,SJWEB,SJWEAPP',
}));

/**
 * 生成分页配置
 */
const paginationConfig = () => ({
  pagination: {
    hmacSecret: getRequiredEnv('PAGINATION_HMAC_SECRET'),
  },
});

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
