import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordView,
  RecordAsyncTaskFinishedInput,
} from '@src/modules/async-task-record/async-task-record.types';

export type RecordAsyncTaskFinishedUsecaseInput = RecordAsyncTaskFinishedInput;

@Injectable()
export class RecordAsyncTaskFinishedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskFinishedUsecaseInput): Promise<AsyncTaskRecordView> {
    return await this.asyncTaskRecordService.recordFinished({ data: input });
  }
}
