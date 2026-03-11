import { Module } from '@nestjs/common';
import { EmailQueueModule } from '@src/modules/common/email-queue/email-queue.module';
import { AsyncTaskRecordUsecasesModule } from '@src/usecases/async-task-record/async-task-record-usecases.module';
import { QueueEmailUsecase } from './queue-email.usecase';

@Module({
  imports: [EmailQueueModule, AsyncTaskRecordUsecasesModule],
  providers: [QueueEmailUsecase],
  exports: [QueueEmailUsecase],
})
export class EmailQueueUsecasesModule {}
