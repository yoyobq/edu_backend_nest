import { Injectable } from '@nestjs/common';
import { ConsumeEmailJobUsecase } from '@src/usecases/email-worker/consume-email-job.usecase';
import type { Job } from 'bullmq';

const EMAIL_QUEUE_NAME = 'email';
const EMAIL_SEND_JOB_NAME = 'send';

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
export class EmailSendHandler {
  constructor(private readonly consumeEmailJobUsecase: ConsumeEmailJobUsecase) {}

  async process(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;
  }): Promise<EmailSendResult> {
    const jobId = this.resolveJobId({ job: input.job });
    return await this.consumeEmailJobUsecase.process({
      queueName: EMAIL_QUEUE_NAME,
      jobName: EMAIL_SEND_JOB_NAME,
      jobId,
      traceId: this.resolveTraceId({ job: input.job, jobId }),
      payload: input.job.data,
      attemptsMade: input.job.attemptsMade,
      maxAttempts: this.resolveMaxAttempts({ job: input.job }),
      enqueuedAt: this.resolveDate({ timestamp: input.job.timestamp }),
      startedAt: this.resolveDate({ timestamp: input.job.processedOn }),
    });
  }

  async onCompleted(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;
  }): Promise<void> {
    const jobId = this.resolveJobId({ job: input.job });
    await this.consumeEmailJobUsecase.complete({
      queueName: EMAIL_QUEUE_NAME,
      jobName: EMAIL_SEND_JOB_NAME,
      jobId,
      traceId: this.resolveTraceId({ job: input.job, jobId }),
      attemptsMade: input.job.attemptsMade,
      maxAttempts: this.resolveMaxAttempts({ job: input.job }),
      enqueuedAt: this.resolveDate({ timestamp: input.job.timestamp }),
      startedAt: this.resolveDate({ timestamp: input.job.processedOn }),
      finishedAt: this.resolveDate({ timestamp: input.job.finishedOn }),
    });
  }

  async onFailed(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME> | undefined;
    readonly error: Error;
  }): Promise<void> {
    if (!input.job) {
      return;
    }
    const jobId = this.resolveJobId({ job: input.job });
    await this.consumeEmailJobUsecase.fail({
      queueName: EMAIL_QUEUE_NAME,
      jobName: EMAIL_SEND_JOB_NAME,
      jobId,
      traceId: this.resolveTraceId({ job: input.job, jobId }),
      attemptsMade: input.job.attemptsMade,
      maxAttempts: this.resolveMaxAttempts({ job: input.job }),
      enqueuedAt: this.resolveDate({ timestamp: input.job.timestamp }),
      startedAt: this.resolveDate({ timestamp: input.job.processedOn }),
      finishedAt: this.resolveDate({ timestamp: input.job.finishedOn }),
      reason: input.error.message.slice(0, 128),
    });
  }

  private resolveDate(input: { readonly timestamp?: number }): Date | undefined {
    if (typeof input.timestamp !== 'number' || Number.isNaN(input.timestamp)) {
      return undefined;
    }
    return new Date(input.timestamp);
  }

  private resolveMaxAttempts(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;
  }): number | undefined {
    const attempts = input.job.opts.attempts;
    if (typeof attempts !== 'number' || Number.isNaN(attempts)) {
      return undefined;
    }
    return attempts;
  }

  private resolveJobId(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;
  }): string {
    if (typeof input.job.id === 'number') {
      return String(input.job.id);
    }
    return input.job.id ?? `${EMAIL_SEND_JOB_NAME}:${input.job.timestamp}`;
  }

  private resolveTraceId(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;
    readonly jobId: string;
  }): string {
    const prefix = `${EMAIL_SEND_JOB_NAME}:`;
    if (input.jobId.startsWith(prefix)) {
      return input.jobId.slice(prefix.length);
    }
    return input.jobId;
  }
}
