// src/adapters/worker/email/email-send.processor.ts
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { EmailSendHandler } from './email-send.handler';
import { EMAIL_QUEUE_NAME, type EmailSendJob, type EmailSendResult } from './email-send.mapper';

@Injectable()
@Processor(EMAIL_QUEUE_NAME)
export class EmailSendProcessor extends WorkerHost {
  constructor(private readonly handler: EmailSendHandler) {
    super();
  }

  async process(job: EmailSendJob): Promise<EmailSendResult> {
    return await this.handler.process({ job });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: EmailSendJob): Promise<void> {
    await this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: EmailSendJob | undefined, error: Error): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
