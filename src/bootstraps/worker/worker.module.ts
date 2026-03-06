import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { RedisModule } from '@src/infrastructure/redis/redis.module';
import { EmailModule } from '@src/modules/common/email/email.module';
import { IntegrationEventsUsecasesModule } from '@src/usecases/integration-events/integration-events-usecases.module';
import { EmailSendProcessor } from './email-send.processor';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    RedisModule,
    BullMqModule,
    EmailModule,
    IntegrationEventsUsecasesModule,
  ],
  providers: [EmailSendProcessor],
})
export class WorkerModule {}
