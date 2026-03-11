import { Injectable } from '@nestjs/common';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { EmailQueueService } from '@src/modules/common/email-queue/email-queue.service';
import type {
  QueueEmailInput,
  QueueEmailResult,
} from '@src/modules/common/email-queue/email-queue.types';
import { RecordAsyncTaskEnqueueFailedUsecase } from '@src/usecases/async-task-record/record-async-task-enqueue-failed.usecase';
import { RecordAsyncTaskEnqueuedUsecase } from '@src/usecases/async-task-record/record-async-task-enqueued.usecase';

@Injectable()
export class QueueEmailUsecase {
  constructor(
    private readonly emailQueueService: EmailQueueService,
    private readonly recordAsyncTaskEnqueuedUsecase: RecordAsyncTaskEnqueuedUsecase,
    private readonly recordAsyncTaskEnqueueFailedUsecase: RecordAsyncTaskEnqueueFailedUsecase,
  ) {}

  async execute(input: QueueEmailInput): Promise<QueueEmailResult> {
    const occurredAt = new Date();
    const result = await this.enqueueOrThrow({ input, occurredAt });
    await this.recordAsyncTaskEnqueuedUsecase.execute({
      queueName: 'email',
      jobName: 'send',
      jobId: result.jobId,
      traceId: result.traceId,
      bizType: 'email',
      bizKey: result.jobId,
      source: this.resolveSource(),
      reason: 'enqueue_accepted',
      occurredAt,
      dedupKey: input.dedupKey,
    });
    return result;
  }

  private async enqueueOrThrow(input: {
    readonly input: QueueEmailInput;
    readonly occurredAt: Date;
  }): Promise<QueueEmailResult> {
    try {
      return await this.emailQueueService.enqueueSend(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('email_enqueue_failed');
      const traceId = this.resolveTraceId({
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
      });
      await this.recordAsyncTaskEnqueueFailedUsecase.execute({
        queueName: 'email',
        jobName: 'send',
        traceId,
        bizType: 'email',
        bizKey: traceId,
        source: this.resolveSource(),
        reason: normalizedError.message.slice(0, 128),
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
      });
      throw normalizedError;
    }
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'user_action';
  }

  private resolveTraceId(input: { readonly traceId?: string; readonly occurredAt: Date }): string {
    const normalized = input.traceId?.trim();
    if (normalized) {
      return normalized;
    }
    return `email-enqueue:${input.occurredAt.getTime()}`;
  }
}
