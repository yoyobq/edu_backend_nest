import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordSource,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';

export interface RecordAsyncTaskEnqueuedUsecaseInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId?: number | null;
  readonly actorActiveRole?: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt?: Date;
}

@Injectable()
export class RecordAsyncTaskEnqueuedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskEnqueuedUsecaseInput): Promise<AsyncTaskRecordView> {
    const occurredAt = input.occurredAt ?? input.enqueuedAt ?? new Date();
    const enqueuedAt = input.enqueuedAt ?? occurredAt;
    return await this.asyncTaskRecordService.createRecord({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        actorAccountId: input.actorAccountId,
        actorActiveRole: input.actorActiveRole,
        bizType: input.bizType,
        bizKey: input.bizKey,
        bizSubKey: input.bizSubKey,
        source: input.source,
        reason: input.reason,
        occurredAt,
        dedupKey: input.dedupKey,
        status: 'queued',
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        enqueuedAt,
      },
    });
  }
}
