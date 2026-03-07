import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailSendHandler } from './email-send.handler';

const EMAIL_QUEUE_NAME = 'email';

interface EmailSendPayload {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
}

interface EmailSendResult {
  readonly accepted: boolean;
  readonly providerMessageId: string;
}

@Injectable()
@Processor(EMAIL_QUEUE_NAME)
export class EmailSendProcessor extends WorkerHost {
  constructor(private readonly handler: EmailSendHandler) {
    super();
  }

  async process(job: Job<EmailSendPayload, EmailSendResult, 'send'>): Promise<EmailSendResult> {
    return await this.handler.process({ job });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<EmailSendPayload, EmailSendResult, 'send'>): Promise<void> {
    await this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<EmailSendPayload, EmailSendResult, 'send'> | undefined,
    error: Error,
  ): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
