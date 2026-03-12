// src/modules/common/ai-queue/ai-queue.service.ts
import { Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { PinoLogger } from 'nestjs-pino';
import type { QueueAiEmbedInput, QueueAiGenerateInput, QueueAiResult } from './ai-queue.types';

@Injectable()
export class AiQueueService {
  constructor(
    private readonly producer: BullMqProducerGateway,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiQueueService.name);
  }

  async enqueueGenerate(input: QueueAiGenerateInput): Promise<QueueAiResult> {
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.GENERATE,
      payload: {
        provider: input.provider,
        model: input.model,
        prompt: input.prompt,
        metadata: input.metadata,
        traceId: input.traceId,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        model: input.model,
        provider: input.provider,
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'AI generate job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }

  async enqueueEmbed(input: QueueAiEmbedInput): Promise<QueueAiResult> {
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.EMBED,
      payload: {
        provider: input.provider,
        model: input.model,
        text: input.text,
        metadata: input.metadata,
        traceId: input.traceId,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        model: input.model,
        provider: input.provider,
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'AI embed job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }
}
