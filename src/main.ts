import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * 应用程序启动函数
 * 使用 NestJS ConfigService 获取配置信息
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 获取 ConfigService 实例
  const configService = app.get(ConfigService);

  // 从配置服务中获取服务器配置
  const host = configService.get<string>('server.host', '127.0.0.1');
  const port = configService.get<number>('server.port', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  await app.listen(port, host);

  // 作为服务器启动时的提醒，此处暴露 console.log 是合理的
  // eslint-disable-next-line no-console
  console.log(`🚀 NestJS 服务在 http://${host}:${port} 上以 ${nodeEnv} 模式启动成功`);
}

void bootstrap();
