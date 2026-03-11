import { Injectable } from '@nestjs/common';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import { RecordAsyncTaskFinishedUsecase } from '@src/usecases/async-task-record/record-async-task-finished.usecase';
import { RecordAsyncTaskStartedUsecase } from '@src/usecases/async-task-record/record-async-task-started.usecase';

export interface ConsumeAiGenerateJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: GenerateAiContentInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeAiGenerateJobCompleteInput {
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

export interface ConsumeAiGenerateJobFailInput extends ConsumeAiGenerateJobCompleteInput {
  readonly reason?: string;
  readonly occurredAt?: Date;
}

@Injectable()
export class ConsumeAiGenerateJobUsecase {
  constructor(
    private readonly aiWorkerService: AiWorkerService,
    private readonly recordAsyncTaskStartedUsecase: RecordAsyncTaskStartedUsecase,
    private readonly recordAsyncTaskFinishedUsecase: RecordAsyncTaskFinishedUsecase,
  ) {}

  async process(input: ConsumeAiGenerateJobProcessInput): Promise<GenerateAiContentResult> {
    await this.recordAsyncTaskStartedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'ai_generation',
      bizKey: input.jobId,
      source: this.resolveSource(),
      reason: 'worker_processing',
      attemptCount: this.resolveAttemptCount({ attemptsMade: input.attemptsMade }),
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      occurredAt: input.startedAt,
    });
    return this.aiWorkerService.generate(input.payload);
  }

  async complete(input: ConsumeAiGenerateJobCompleteInput): Promise<void> {
    await this.recordAsyncTaskFinishedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'ai_generation',
      bizKey: input.jobId,
      source: this.resolveSource(),
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

  async fail(input: ConsumeAiGenerateJobFailInput): Promise<void> {
    await this.recordAsyncTaskFinishedUsecase.execute({
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      bizType: 'ai_generation',
      bizKey: input.jobId,
      source: this.resolveSource(),
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

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}
