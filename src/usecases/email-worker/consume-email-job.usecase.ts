import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type {
  AsyncTaskRecordSource,
  AsyncTaskRecordView,
  FindAsyncTaskRecordByQueueJobInput,
  UpdateAsyncTaskRecordStatusInput,
} from '@src/modules/async-task-record/async-task-record.types';
import { EmailDeliveryService } from '@src/modules/common/email-worker/email-delivery.service';
import type {
  SendEmailInput,
  SendEmailResult,
} from '@src/modules/common/email-worker/email-worker.types';

export interface ConsumeEmailJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: SendEmailInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeEmailJobCompleteInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
}

export interface ConsumeEmailJobFailInput extends ConsumeEmailJobCompleteInput {
  readonly reason?: string;
  readonly occurredAt?: Date;
}

@Injectable()
export class ConsumeEmailJobUsecase {
  constructor(
    private readonly emailDeliveryService: EmailDeliveryService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async process(input: ConsumeEmailJobProcessInput): Promise<SendEmailResult> {
    await this.recordStarted({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      reason: 'worker_processing',
      attemptCount: this.resolveAttemptCount({ attemptsMade: input.attemptsMade }),
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      occurredAt: input.startedAt,
    });
    return await this.emailDeliveryService.send(input.payload);
  }

  async complete(input: ConsumeEmailJobCompleteInput): Promise<void> {
    await this.recordFinished({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      status: 'succeeded',
      reason: 'worker_completed',
      attemptCount: this.resolveAttemptCount({ attemptsMade: input.attemptsMade }),
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      occurredAt: input.finishedAt,
    });
  }

  async fail(input: ConsumeEmailJobFailInput): Promise<void> {
    await this.recordFinished({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      status: 'failed',
      reason: input.reason,
      attemptCount: this.resolveAttemptCount({ attemptsMade: input.attemptsMade }),
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      occurredAt: input.occurredAt ?? input.finishedAt,
    });
  }

  private resolveAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private async recordStarted(input: {
    readonly queueName: string;
    readonly jobName: string;
    readonly jobId: string;
    readonly traceId: string;
    readonly reason?: string;
    readonly attemptCount: number;
    readonly maxAttempts?: number;
    readonly enqueuedAt?: Date;
    readonly startedAt?: Date;
    readonly occurredAt?: Date;
  }): Promise<AsyncTaskRecordView> {
    const startedAt = input.startedAt ?? new Date();
    const occurredAt = input.occurredAt ?? startedAt;
    const where: FindAsyncTaskRecordByQueueJobInput = {
      queueName: input.queueName,
      jobId: input.jobId,
    };
    const existing = await this.asyncTaskRecordService.findByQueueJob({ where });
    if (existing) {
      const patch: UpdateAsyncTaskRecordStatusInput = {
        status: 'processing',
        startedAt,
        occurredAt,
        attemptCount: input.attemptCount,
        reason: input.reason,
      };
      const updated = await this.asyncTaskRecordService.updateStatusByQueueJob({ where, patch });
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
        bizType: 'email',
        bizKey: input.jobId,
        source: this.resolveSource(),
        reason: input.reason,
        occurredAt,
        status: 'processing',
        attemptCount: input.attemptCount,
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt ?? startedAt,
        startedAt,
      },
    });
  }

  private async recordFinished(input: {
    readonly queueName: string;
    readonly jobName: string;
    readonly jobId: string;
    readonly traceId: string;
    readonly status: 'succeeded' | 'failed';
    readonly reason?: string;
    readonly attemptCount: number;
    readonly maxAttempts?: number;
    readonly enqueuedAt?: Date;
    readonly startedAt?: Date;
    readonly finishedAt?: Date;
    readonly occurredAt?: Date;
  }): Promise<AsyncTaskRecordView> {
    const finishedAt = input.finishedAt ?? new Date();
    const occurredAt = input.occurredAt ?? finishedAt;
    const where: FindAsyncTaskRecordByQueueJobInput = {
      queueName: input.queueName,
      jobId: input.jobId,
    };
    const existing = await this.asyncTaskRecordService.findByQueueJob({ where });
    if (existing) {
      const patch: UpdateAsyncTaskRecordStatusInput = {
        status: input.status,
        finishedAt,
        occurredAt,
        attemptCount: input.attemptCount,
        reason: input.reason,
      };
      const updated = await this.asyncTaskRecordService.updateStatusByQueueJob({ where, patch });
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
        bizType: 'email',
        bizKey: input.jobId,
        source: this.resolveSource(),
        reason: input.reason,
        occurredAt,
        status: input.status,
        attemptCount: input.attemptCount,
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt ?? finishedAt,
        startedAt: input.startedAt ?? null,
        finishedAt,
      },
    });
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}
