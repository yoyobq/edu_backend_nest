import { Inject, Injectable, Module, OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const buildRedisOptions = (configService: ConfigService): RedisOptions => {
  const host = configService.get<string>('redis.host', '127.0.0.1');
  const port = configService.get<number>('redis.port', 6379);
  const db = configService.get<number>('redis.db', 0);
  const password = configService.get<string>('redis.password');
  const tlsEnabled = configService.get<boolean>('redis.tls', false);
  const options: RedisOptions = {
    host,
    port,
    db,
  };
  if (password && password.trim().length > 0) {
    options.password = password;
  }
  if (tlsEnabled) {
    options.tls = {};
  }
  return options;
};

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService): Redis => {
    const options = buildRedisOptions(configService);
    return new Redis(options);
  },
  inject: [ConfigService],
};

@Injectable()
class RedisLifecycleService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider, RedisLifecycleService],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
