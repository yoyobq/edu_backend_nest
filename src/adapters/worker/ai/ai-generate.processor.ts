import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AiGenerateHandler } from './ai-generate.handler';
import { AI_QUEUE_NAME, type AiGenerateJob, type AiGenerateResult } from './ai-generate.mapper';

@Injectable()
@Processor(AI_QUEUE_NAME)
export class AiGenerateProcessor extends WorkerHost {
  constructor(private readonly handler: AiGenerateHandler) {
    super();
  }

  async process(job: AiGenerateJob): Promise<AiGenerateResult> {
    return await this.handler.process({ job });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: AiGenerateJob): Promise<void> {
    await this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: AiGenerateJob | undefined, error: Error): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
