// src/bootstraps/worker/worker.module.ts
import { Module } from '@nestjs/common';
import { AiWorkerAdapterModule } from '@src/adapters/worker/ai/ai-worker-adapter.module';
import { EmailWorkerAdapterModule } from '@src/adapters/worker/email/email-worker-adapter.module';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { BullMqWorkerRuntime } from '@src/infrastructure/bullmq/worker.runtime';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { DatabaseModule } from '@src/infrastructure/database/database.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { RedisModule } from '@src/infrastructure/redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    RedisModule,
    BullMqModule,
    AiWorkerAdapterModule,
    EmailWorkerAdapterModule,
  ],
  providers: [BullMqWorkerRuntime],
})
export class WorkerModule {}
