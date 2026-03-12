// src/usecases/ai-queue/queue-ai.usecase.ts
import { Injectable } from '@nestjs/common';
import {
  resolveAsyncTaskBizKey,
  resolveEnqueueFailureIdentifiers,
} from '@src/core/common/async-task/async-task-identifier.policy';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiQueueService } from '@src/modules/common/ai-queue/ai-queue.service';
import type {
  QueueAiEmbedInput,
  QueueAiGenerateInput,
  QueueAiResult,
} from '@src/modules/common/ai-queue/ai-queue.types';

@Injectable()
export class QueueAiUsecase {
  constructor(
    private readonly aiQueueService: AiQueueService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async executeGenerate(input: QueueAiGenerateInput): Promise<QueueAiResult> {
    const occurredAt = new Date();
    const result = await this.enqueueGenerateOrThrow({
      input,
      occurredAt,
    });
    await this.asyncTaskRecordService.recordEnqueued({
      data: {
        queueName: 'ai',
        jobName: 'generate',
        jobId: result.jobId,
        traceId: result.traceId,
        bizType: 'ai_generation',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: result.traceId,
          jobId: result.jobId,
          dedupKey: input.dedupKey,
        }),
        source: this.resolveSource(),
        reason: 'enqueue_accepted',
        occurredAt,
        dedupKey: input.dedupKey,
      },
    });
    return result;
  }

  async executeEmbed(input: QueueAiEmbedInput): Promise<QueueAiResult> {
    const occurredAt = new Date();
    const result = await this.enqueueEmbedOrThrow({
      input,
      occurredAt,
    });
    await this.asyncTaskRecordService.recordEnqueued({
      data: {
        queueName: 'ai',
        jobName: 'embed',
        jobId: result.jobId,
        traceId: result.traceId,
        bizType: 'ai_embedding',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: result.traceId,
          jobId: result.jobId,
          dedupKey: input.dedupKey,
        }),
        source: this.resolveSource(),
        reason: 'enqueue_accepted',
        occurredAt,
        dedupKey: input.dedupKey,
      },
    });
    return result;
  }

  private async enqueueGenerateOrThrow(input: {
    readonly input: QueueAiGenerateInput;
    readonly occurredAt: Date;
  }): Promise<QueueAiResult> {
    try {
      return await this.aiQueueService.enqueueGenerate(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('ai_enqueue_failed');
      const identifiers = resolveEnqueueFailureIdentifiers({
        domain: 'ai_generation',
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
        traceIdPrefix: 'ai-generate-enqueue:',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: 'ai',
          jobName: 'generate',
          jobId: identifiers.failedJobId,
          traceId: identifiers.traceId,
          bizType: 'ai_generation',
          bizKey: identifiers.bizKey,
          source: this.resolveSource(),
          reason: this.resolveEnqueueFailedReason({ message: normalizedError.message }),
          occurredAt: input.occurredAt,
          dedupKey: input.input.dedupKey,
        },
      });
      throw normalizedError;
    }
  }

  private async enqueueEmbedOrThrow(input: {
    readonly input: QueueAiEmbedInput;
    readonly occurredAt: Date;
  }): Promise<QueueAiResult> {
    try {
      return await this.aiQueueService.enqueueEmbed(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('ai_enqueue_failed');
      const identifiers = resolveEnqueueFailureIdentifiers({
        domain: 'ai_embedding',
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
        traceIdPrefix: 'ai-embed-enqueue:',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: 'ai',
          jobName: 'embed',
          jobId: identifiers.failedJobId,
          traceId: identifiers.traceId,
          bizType: 'ai_embedding',
          bizKey: identifiers.bizKey,
          source: this.resolveSource(),
          reason: this.resolveEnqueueFailedReason({ message: normalizedError.message }),
          occurredAt: input.occurredAt,
          dedupKey: input.input.dedupKey,
        },
      });
      throw normalizedError;
    }
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'user_action';
  }

  private resolveEnqueueFailedReason(input: { readonly message: string }): string {
    const normalizedMessage = input.message.trim() || 'enqueue_unknown_error';
    if (normalizedMessage.startsWith('enqueue_failed:')) {
      return normalizedMessage.slice(0, 128);
    }
    const prefix = 'enqueue_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    const summary = normalizedMessage.slice(0, availableSummaryLength);
    return `${prefix}${summary}`;
  }
}
