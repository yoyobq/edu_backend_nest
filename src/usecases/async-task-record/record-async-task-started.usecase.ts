import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordView,
  RecordAsyncTaskStartedInput,
} from '@src/modules/async-task-record/async-task-record.types';

export type RecordAsyncTaskStartedUsecaseInput = RecordAsyncTaskStartedInput;

@Injectable()
export class RecordAsyncTaskStartedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskStartedUsecaseInput): Promise<AsyncTaskRecordView> {
    return await this.asyncTaskRecordService.recordStarted({ data: input });
  }
}
