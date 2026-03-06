import { Module } from '@nestjs/common';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { RedisModule } from '@src/infrastructure/redis/redis.module';

@Module({
  imports: [AppConfigModule, LoggerModule, RedisModule, BullMqModule],
})
export class WorkerModule {}
