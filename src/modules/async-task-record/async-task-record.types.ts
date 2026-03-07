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
  readonly source: 'user_action' | 'admin_action' | 'system' | 'cron' | 'domain_event' | 'webhook';
  readonly reason: string | null;
  readonly occurredAt: Date | null;
  readonly dedupKey: string | null;
  readonly status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
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
  readonly statuses?: ReadonlyArray<'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'>;
  readonly limit?: number;
}
