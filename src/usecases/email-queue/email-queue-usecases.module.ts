import { Module } from '@nestjs/common';
import { EmailQueueModule } from '@src/modules/common/email-queue/email-queue.module';
import { QueueEmailUsecase } from './queue-email.usecase';

@Module({
  imports: [EmailQueueModule],
  providers: [QueueEmailUsecase],
  exports: [QueueEmailUsecase],
})
export class EmailQueueUsecasesModule {}
