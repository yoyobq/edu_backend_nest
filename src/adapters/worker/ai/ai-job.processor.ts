// src/adapters/worker/ai/ai-job.processor.ts
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AiJobHandler } from './ai-job.handler';
import {
  AI_EMBED_JOB_NAME,
  type AiFailedJob,
  AI_GENERATE_JOB_NAME,
  AI_QUEUE_NAME,
  type AiJob,
  type AiJobResult,
} from './ai-job.mapper';

@Injectable()
@Processor(AI_QUEUE_NAME)
export class AiJobProcessor extends WorkerHost {
  constructor(private readonly handler: AiJobHandler) {
    super();
  }

  async process(job: AiJob): Promise<AiJobResult> {
    if (job.name === AI_GENERATE_JOB_NAME) {
      return await this.handler.processGenerate({ job });
    }
    if (job.name === AI_EMBED_JOB_NAME) {
      return await this.handler.processEmbed({ job });
    }
    throw new Error('Unsupported AI job');
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: AiJob): Promise<void> {
    if (job.name === AI_GENERATE_JOB_NAME) {
      await this.handler.onGenerateCompleted({ job });
      return;
    }
    if (job.name === AI_EMBED_JOB_NAME) {
      await this.handler.onEmbedCompleted({ job });
      return;
    }
    throw new Error('Unsupported AI job');
  }

  @OnWorkerEvent('failed')
  async onFailed(job: AiFailedJob | undefined, error: Error): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
