import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { EmailWorkerModule } from '@src/modules/common/email-worker/email-worker.module';
import { ConsumeEmailJobUsecase } from './consume-email-job.usecase';
import { LogEmailWorkerStartUsecase } from './log-email-worker-start.usecase';

@Module({
  imports: [EmailWorkerModule, AsyncTaskRecordModule],
  providers: [LogEmailWorkerStartUsecase, ConsumeEmailJobUsecase],
  exports: [LogEmailWorkerStartUsecase, ConsumeEmailJobUsecase],
})
export class EmailWorkerUsecasesModule {}
