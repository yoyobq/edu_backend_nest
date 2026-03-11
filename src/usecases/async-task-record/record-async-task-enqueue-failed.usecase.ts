import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordView,
  RecordAsyncTaskEnqueueFailedInput,
} from '@src/modules/async-task-record/async-task-record.types';

export type RecordAsyncTaskEnqueueFailedUsecaseInput = RecordAsyncTaskEnqueueFailedInput;

@Injectable()
export class RecordAsyncTaskEnqueueFailedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskEnqueueFailedUsecaseInput): Promise<AsyncTaskRecordView> {
    return await this.asyncTaskRecordService.recordEnqueueFailed({ data: input });
  }
}
