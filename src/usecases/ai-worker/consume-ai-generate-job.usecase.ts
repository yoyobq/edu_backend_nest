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
import { resolveAsyncTaskBizKey } from '@src/core/common/async-task/async-task-identifier.policy';

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
  readonly bizKey?: string;
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
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
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
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
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
    const bizType = input.bizType ?? 'ai_generation';
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType,
        bizKey:
          input.bizKey ??
          this.resolveGenerateFailBizKey({
            bizType,
            traceId: input.traceId,
            jobId: input.jobId,
          }),
        source: this.resolveSource(),
        status: 'failed',
        reason: this.resolveGenerateFailReason({
          bizType,
          reason: input.reason,
        }),
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

  private resolveGenerateFailBizKey(input: {
    readonly bizType: 'ai_generation' | 'ai_worker';
    readonly traceId: string;
    readonly jobId: string;
  }): string {
    if (input.bizType === 'ai_worker') {
      return input.traceId;
    }
    return resolveAsyncTaskBizKey({
      domain: 'ai_generation',
      traceId: input.traceId,
      jobId: input.jobId,
    });
  }

  private resolveGenerateFailReason(input: {
    readonly bizType: 'ai_generation' | 'ai_worker';
    readonly reason?: string;
  }): string {
    const normalizedReason = input.reason?.trim() || 'worker_unknown_error';
    if (input.bizType === 'ai_worker') {
      return normalizedReason;
    }
    if (
      normalizedReason.startsWith('worker_failed:') ||
      normalizedReason.startsWith('missing_payload_trace_id')
    ) {
      return normalizedReason.slice(0, 128);
    }
    const prefix = 'worker_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    const summary = normalizedReason.slice(0, availableSummaryLength);
    return `${prefix}${summary}`;
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
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
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
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
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
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
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
