import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

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

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = buildRedisOptions(configService);
        const prefix = configService.get<string>('bullmq.prefix', 'bullmq');
        return {
          connection,
          prefix,
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class BullMqModule {}
