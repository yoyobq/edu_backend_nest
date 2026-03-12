// src/usecases/ai-queue/queue-ai.usecase.ts
import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiQueueService } from '@src/modules/common/ai-queue/ai-queue.service';
import type {
  QueueAiEmbedInput,
  QueueAiGenerateInput,
  QueueAiResult,
} from '@src/modules/common/ai-queue/ai-queue.types';

type QueueAiJobName = 'generate' | 'embed';
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
        bizKey: result.jobId,
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
        bizKey: result.jobId,
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
      const traceId = this.resolveTraceId({
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        jobName: 'generate',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: 'ai',
          jobName: 'generate',
          traceId,
          bizType: 'ai_generation',
          bizKey: traceId,
          source: this.resolveSource(),
          reason: normalizedError.message.slice(0, 128),
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
      const traceId = this.resolveTraceId({
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        jobName: 'embed',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: 'ai',
          jobName: 'embed',
          traceId,
          bizType: 'ai_embedding',
          bizKey: traceId,
          source: this.resolveSource(),
          reason: normalizedError.message.slice(0, 128),
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

  private resolveTraceId(input: {
    readonly traceId?: string;
    readonly occurredAt: Date;
    readonly jobName: QueueAiJobName;
  }): string {
    const normalized = input.traceId?.trim();
    if (normalized) {
      return normalized;
    }
    return `ai-${input.jobName}-enqueue:${input.occurredAt.getTime()}`;
  }
}
