import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordView,
  RecordAsyncTaskEnqueuedInput,
} from '@src/modules/async-task-record/async-task-record.types';

export type RecordAsyncTaskEnqueuedUsecaseInput = RecordAsyncTaskEnqueuedInput;

@Injectable()
export class RecordAsyncTaskEnqueuedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskEnqueuedUsecaseInput): Promise<AsyncTaskRecordView> {
    return await this.asyncTaskRecordService.recordEnqueued({ data: input });
  }
}
