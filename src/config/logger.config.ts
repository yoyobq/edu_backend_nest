// src/config/logger.config.ts
import { ConfigFactory } from '@nestjs/config';

const loggerConfig: ConfigFactory = () => {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    logger: {
      level: isDev ? 'debug' : 'warn',
      // 在日志输出中自动屏蔽掉 req.headers.authorization 字段的值，防止泄露敏感信息
      redactFields: ['req.headers.authorization'],
    },
  };
};

export default loggerConfig;
