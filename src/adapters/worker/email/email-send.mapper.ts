import type {
  ConsumeEmailJobCompleteInput,
  ConsumeEmailJobFailInput,
  ConsumeEmailJobProcessInput,
} from '@src/usecases/email-worker/consume-email-job.usecase';
import type { Job } from 'bullmq';

export const EMAIL_QUEUE_NAME = 'email';
export const EMAIL_SEND_JOB_NAME = 'send';

export interface EmailSendPayload {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
}

export interface EmailSendResult {
  readonly accepted: boolean;
  readonly providerMessageId: string;
}

export type EmailSendJob = Job<EmailSendPayload, EmailSendResult, typeof EMAIL_SEND_JOB_NAME>;

export function mapEmailSendJobToProcessInput(input: {
  readonly job: EmailSendJob;
}): ConsumeEmailJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    payload: input.job.data,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
  };
}

export function mapEmailSendJobToCompleteInput(input: {
  readonly job: EmailSendJob;
}): ConsumeEmailJobCompleteInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: resolveDate({ timestamp: input.job.finishedOn }),
  };
}

export function mapEmailSendJobToFailInput(input: {
  readonly job: EmailSendJob;
  readonly error: Error;
}): ConsumeEmailJobFailInput {
  const occurredAt = resolveDate({ timestamp: input.job.finishedOn });
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: occurredAt,
    occurredAt,
    reason: input.error.message.slice(0, 128),
  };
}

export function mapMissingEmailSendJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeEmailJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobId = resolveMissingJobId({ occurredAt });
  return {
    queueName: EMAIL_QUEUE_NAME,
    jobName: EMAIL_SEND_JOB_NAME,
    jobId,
    traceId: jobId,
    attemptsMade: 0,
    enqueuedAt: occurredAt,
    finishedAt: occurredAt,
    occurredAt,
    reason: `worker_event_job_missing:${input.error.message.slice(0, 96)}`,
  };
}

function resolveDate(input: { readonly timestamp?: number }): Date | undefined {
  if (typeof input.timestamp !== 'number' || Number.isNaN(input.timestamp)) {
    return undefined;
  }
  return new Date(input.timestamp);
}

function resolveMaxAttempts(input: { readonly job: EmailSendJob }): number | undefined {
  const attempts = input.job.opts.attempts;
  if (typeof attempts !== 'number' || Number.isNaN(attempts)) {
    return undefined;
  }
  return attempts;
}

function resolveJobId(input: { readonly job: EmailSendJob }): string {
  if (typeof input.job.id === 'number') {
    return String(input.job.id);
  }
  return input.job.id ?? `${EMAIL_SEND_JOB_NAME}:${input.job.timestamp}`;
}

function resolveTraceId(input: { readonly jobId: string }): string {
  const prefix = `${EMAIL_SEND_JOB_NAME}:`;
  if (input.jobId.startsWith(prefix)) {
    return input.jobId.slice(prefix.length);
  }
  return input.jobId;
}

function resolveMissingJobId(input: { readonly occurredAt: Date }): string {
  return `missing-job:${input.occurredAt.getTime()}`;
}
