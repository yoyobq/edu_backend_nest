import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { RecordAsyncTaskEnqueuedUsecase } from './record-async-task-enqueued.usecase';
import { RecordAsyncTaskEnqueueFailedUsecase } from './record-async-task-enqueue-failed.usecase';
import { RecordAsyncTaskFinishedUsecase } from './record-async-task-finished.usecase';
import { RecordAsyncTaskStartedUsecase } from './record-async-task-started.usecase';

@Module({
  imports: [AsyncTaskRecordModule],
  providers: [
    RecordAsyncTaskEnqueuedUsecase,
    RecordAsyncTaskEnqueueFailedUsecase,
    RecordAsyncTaskStartedUsecase,
    RecordAsyncTaskFinishedUsecase,
  ],
  exports: [
    RecordAsyncTaskEnqueuedUsecase,
    RecordAsyncTaskEnqueueFailedUsecase,
    RecordAsyncTaskStartedUsecase,
    RecordAsyncTaskFinishedUsecase,
  ],
})
export class AsyncTaskRecordUsecasesModule {}
