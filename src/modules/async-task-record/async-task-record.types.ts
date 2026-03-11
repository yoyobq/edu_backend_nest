import type { AsyncTaskRecordSource, AsyncTaskRecordStatus } from './async-task-record.entity';

export type { AsyncTaskRecordSource, AsyncTaskRecordStatus };

export interface AsyncTaskRecordView {
  readonly id: number;
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly actorAccountId: number | null;
  readonly actorActiveRole: string | null;
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey: string | null;
  readonly source: AsyncTaskRecordSource;
  readonly reason: string | null;
  readonly occurredAt: Date | null;
  readonly dedupKey: string | null;
  readonly status: AsyncTaskRecordStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number | null;
  readonly enqueuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FindAsyncTaskRecordByQueueJobInput {
  readonly queueName: string;
  readonly jobId: string;
}

export interface ListAsyncTaskRecordsByTraceInput {
  readonly traceId: string;
  readonly limit?: number;
}

export interface ListAsyncTaskRecordsByBizTargetInput {
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
  readonly limit?: number;
}

export interface RecordAsyncTaskEnqueuedInput {
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

export interface RecordAsyncTaskEnqueueFailedInput {
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

export interface RecordAsyncTaskStartedInput {
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

export interface RecordAsyncTaskFinishedInput {
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
  readonly status: 'succeeded' | 'failed';
  readonly reason?: string | null;
  readonly dedupKey?: string | null;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date;
  readonly occurredAt?: Date | null;
  readonly attemptCount?: number;
}

export interface CreateAsyncTaskRecordInput {
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
  readonly status: AsyncTaskRecordStatus;
  readonly attemptCount?: number;
  readonly maxAttempts?: number | null;
  readonly enqueuedAt: Date;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date | null;
}

export interface UpdateAsyncTaskRecordStatusInput {
  readonly status?: AsyncTaskRecordStatus;
  readonly attemptCount?: number;
  readonly startedAt?: Date | null;
  readonly finishedAt?: Date | null;
  readonly reason?: string | null;
  readonly occurredAt?: Date | null;
}
