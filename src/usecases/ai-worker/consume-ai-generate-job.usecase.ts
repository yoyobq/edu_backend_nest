// src/usecases/ai-worker/consume-ai-generate-job.usecase.ts
import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';

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
  readonly bizType?: 'ai_generation' | 'ai_worker';
  readonly reason?: string;
  readonly occurredAt?: Date;
}

export interface ConsumeAiEmbedJobProcessInput {
  readonly queueName: string;
  readonly jobName: string;
  readonly jobId: string;
  readonly traceId: string;
  readonly payload: EmbedAiContentInput;
  readonly attemptsMade: number;
  readonly maxAttempts?: number;
  readonly enqueuedAt?: Date;
  readonly startedAt?: Date;
}

export interface ConsumeAiEmbedJobCompleteInput {
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

export interface ConsumeAiEmbedJobFailInput extends ConsumeAiEmbedJobCompleteInput {
  readonly reason?: string;
  readonly occurredAt?: Date;
}

@Injectable()
export class ConsumeAiGenerateJobUsecase {
  constructor(
    private readonly aiWorkerService: AiWorkerService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async process(input: ConsumeAiGenerateJobProcessInput): Promise<GenerateAiContentResult> {
    await this.asyncTaskRecordService.recordStarted({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_generation',
        bizKey: input.jobId,
        source: this.resolveSource(),
        reason: 'worker_processing',
        attemptCount: this.resolveProcessingAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        occurredAt: input.startedAt,
      },
    });
    return this.aiWorkerService.generate(input.payload);
  }

  async complete(input: ConsumeAiGenerateJobCompleteInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_generation',
        bizKey: input.jobId,
        source: this.resolveSource(),
        status: 'succeeded',
        reason: 'worker_completed',
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.finishedAt,
      },
    });
  }

  async fail(input: ConsumeAiGenerateJobFailInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: input.bizType ?? 'ai_generation',
        bizKey: input.jobId,
        source: this.resolveSource(),
        status: 'failed',
        reason: input.reason,
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.occurredAt ?? input.finishedAt,
      },
    });
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}

@Injectable()
export class ConsumeAiEmbedJobUsecase {
  constructor(
    private readonly aiWorkerService: AiWorkerService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async process(input: ConsumeAiEmbedJobProcessInput): Promise<EmbedAiContentResult> {
    await this.asyncTaskRecordService.recordStarted({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_embedding',
        bizKey: input.jobId,
        source: this.resolveSource(),
        reason: 'worker_processing',
        attemptCount: this.resolveProcessingAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        occurredAt: input.startedAt,
      },
    });
    return this.aiWorkerService.embed(input.payload);
  }

  async complete(input: ConsumeAiEmbedJobCompleteInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_embedding',
        bizKey: input.jobId,
        source: this.resolveSource(),
        status: 'succeeded',
        reason: 'worker_completed',
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.finishedAt,
      },
    });
  }

  async fail(input: ConsumeAiEmbedJobFailInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_embedding',
        bizKey: input.jobId,
        source: this.resolveSource(),
        status: 'failed',
        reason: input.reason,
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.occurredAt ?? input.finishedAt,
      },
    });
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}
