import { Module } from '@nestjs/common';
import { EmailWorkerModule } from '@src/modules/common/email-worker/email-worker.module';
import { AsyncTaskRecordUsecasesModule } from '@src/usecases/async-task-record/async-task-record-usecases.module';
import { ConsumeEmailJobUsecase } from './consume-email-job.usecase';
import { LogEmailWorkerStartUsecase } from './log-email-worker-start.usecase';

@Module({
  imports: [EmailWorkerModule, AsyncTaskRecordUsecasesModule],
  providers: [LogEmailWorkerStartUsecase, ConsumeEmailJobUsecase],
  exports: [LogEmailWorkerStartUsecase, ConsumeEmailJobUsecase],
})
export class EmailWorkerUsecasesModule {}
