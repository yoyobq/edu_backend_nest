import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordSource,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';

export interface RecordAsyncTaskEnqueueFailedUsecaseInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId?: string;
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
}

@Injectable()
export class RecordAsyncTaskEnqueueFailedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskEnqueueFailedUsecaseInput): Promise<AsyncTaskRecordView> {
    const occurredAt = input.occurredAt ?? new Date();
    return await this.asyncTaskRecordService.createRecord({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: this.resolveJobId({ jobId: input.jobId, traceId: input.traceId, occurredAt }),
        traceId: input.traceId,
        actorAccountId: input.actorAccountId,
        actorActiveRole: input.actorActiveRole,
        bizType: input.bizType,
        bizKey: input.bizKey,
        bizSubKey: input.bizSubKey,
        source: input.source,
        reason: input.reason ?? 'enqueue_failed',
        occurredAt,
        dedupKey: input.dedupKey,
        status: 'failed',
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        enqueuedAt: occurredAt,
        finishedAt: occurredAt,
      },
    });
  }

  private resolveJobId(input: {
    readonly jobId?: string;
    readonly traceId: string;
    readonly occurredAt: Date;
  }): string {
    const normalized = input.jobId?.trim();
    if (normalized) {
      return normalized;
    }
    return `enqueue-failed:${input.traceId}:${input.occurredAt.getTime()}`;
  }
}
