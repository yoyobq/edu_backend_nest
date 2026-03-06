import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { RedisModule } from '@src/infrastructure/redis/redis.module';
import { IntegrationEventsUsecasesModule } from '@src/usecases/integration-events/integration-events-usecases.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    RedisModule,
    BullMqModule,
    IntegrationEventsUsecasesModule,
  ],
})
export class WorkerModule {}
