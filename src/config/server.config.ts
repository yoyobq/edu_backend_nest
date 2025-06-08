// src/config/server.config.ts
import { ConfigFactory } from '@nestjs/config';

const serverConfig: ConfigFactory = () => ({
  server: {
    host: process.env.APP_HOST || '127.0.0.1',
    port: parseInt(process.env.APP_PORT || '3000', 10),
  },
});

export default serverConfig;
