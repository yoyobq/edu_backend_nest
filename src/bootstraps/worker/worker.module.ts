import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { RedisModule } from '@src/infrastructure/redis/redis.module';
import { EmailWorkerModule } from '@src/modules/common/email-worker/email-worker.module';
import { EmailWorkerUsecasesModule } from '@src/usecases/email-worker/email-worker-usecases.module';
import { IntegrationEventsUsecasesModule } from '@src/usecases/integration-events/integration-events-usecases.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    RedisModule,
    BullMqModule,
    EmailWorkerModule,
    EmailWorkerUsecasesModule,
    IntegrationEventsUsecasesModule,
  ],
})
export class WorkerModule {}
