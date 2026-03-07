import { Injectable } from '@nestjs/common';
import { EmailDeliveryService } from '@src/modules/common/email-worker/email-delivery.service';
import type {
  SendEmailInput,
  SendEmailResult,
} from '@src/modules/common/email-worker/email-worker.types';
import { RecordAsyncTaskFinishedUsecase } from '@src/usecases/async-task-record/record-async-task-finished.usecase';
import { RecordAsyncTaskStartedUsecase } from '@src/usecases/async-task-record/record-async-task-started.usecase';

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
}

@Injectable()
export class ConsumeEmailJobUsecase {
  constructor(
    private readonly emailDeliveryService: EmailDeliveryService,
    private readonly recordAsyncTaskStartedUsecase: RecordAsyncTaskStartedUsecase,
    private readonly recordAsyncTaskFinishedUsecase: RecordAsyncTaskFinishedUsecase,
  ) {}

  async process(input: ConsumeEmailJobProcessInput): Promise<SendEmailResult> {
    await this.recordAsyncTaskStartedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'email',
      bizKey: input.jobId,
      source: 'system',
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
    await this.recordAsyncTaskFinishedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'email',
      bizKey: input.jobId,
      source: 'system',
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
    await this.recordAsyncTaskFinishedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'email',
      bizKey: input.jobId,
      source: 'system',
      status: 'failed',
      reason: input.reason,
      attemptCount: this.resolveAttemptCount({ attemptsMade: input.attemptsMade }),
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      occurredAt: input.finishedAt,
    });
  }

  private resolveAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }
}
