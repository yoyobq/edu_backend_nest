// src/core/config/server.config.ts
import { ConfigFactory } from '@nestjs/config';

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

export default serverConfig;
