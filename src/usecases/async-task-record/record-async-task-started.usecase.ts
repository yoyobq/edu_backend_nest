import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import {
  AsyncTaskRecordSource,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';

export interface RecordAsyncTaskStartedUsecaseInput {
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
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
  readonly occurredAt?: Date | null;
  readonly attemptCount?: number;
}

@Injectable()
export class RecordAsyncTaskStartedUsecase {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async execute(input: RecordAsyncTaskStartedUsecaseInput): Promise<AsyncTaskRecordView> {
    const startedAt = input.startedAt ?? new Date();
    const occurredAt = input.occurredAt ?? startedAt;
    const existing = await this.asyncTaskRecordService.findByQueueJob({
      where: { queueName: input.queueName, jobId: input.jobId },
    });
    const attemptCount = input.attemptCount ?? Math.max((existing?.attemptCount ?? 0) + 1, 1);

    if (existing) {
      const updated = await this.asyncTaskRecordService.updateStatusByQueueJob({
        where: { queueName: input.queueName, jobId: input.jobId },
        patch: {
          status: 'processing',
          startedAt,
          occurredAt,
          attemptCount,
          reason: input.reason,
        },
      });
      if (updated) {
        return updated;
      }
    }

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
        status: 'processing',
        attemptCount,
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt ?? startedAt,
        startedAt,
      },
    });
  }
}
