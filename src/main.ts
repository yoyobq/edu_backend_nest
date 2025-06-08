import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 根据生成/开发环境加载不同的配置 env 文件
  const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
  config({ path: resolve(__dirname, `../env/${envFile}`) });

  // 从 .env 中读取配置
  const port = parseInt(process.env.APP_PORT || '3000', 10);
  const host = process.env.APP_HOST || '127.0.0.1';

  await app.listen(port, host);

  // 作为服务器启动时的提醒，此处暴露 console.log 是合理的
  // eslint-disable-next-line no-console
  console.log(
    `🚀 NestJS 服务在 http://${host}:${port} 上以 ${process.env.NODE_ENV || 'development'} 模式启动成功`,
  );
}

void bootstrap();
