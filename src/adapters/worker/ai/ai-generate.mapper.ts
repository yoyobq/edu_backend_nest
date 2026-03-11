import type {
  ConsumeAiEmbedJobCompleteInput,
  ConsumeAiEmbedJobFailInput,
  ConsumeAiEmbedJobProcessInput,
  ConsumeAiGenerateJobCompleteInput,
  ConsumeAiGenerateJobFailInput,
  ConsumeAiGenerateJobProcessInput,
} from '@src/usecases/ai-worker/consume-ai-generate-job.usecase';
import type { Job } from 'bullmq';

export const AI_QUEUE_NAME = 'ai';
export const AI_GENERATE_JOB_NAME = 'generate';
export const AI_EMBED_JOB_NAME = 'embed';

export interface AiGeneratePayload {
  readonly provider?: string;
  readonly model: string;
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiGenerateResult {
  readonly accepted: boolean;
  readonly outputText: string;
  readonly providerJobId: string;
}

export interface AiEmbedPayload {
  readonly provider?: string;
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiEmbedResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly providerJobId: string;
}

export type AiGenerateJob = Job<AiGeneratePayload, AiGenerateResult, typeof AI_GENERATE_JOB_NAME>;
export type AiEmbedJob = Job<AiEmbedPayload, AiEmbedResult, typeof AI_EMBED_JOB_NAME>;
export type AiJob = AiGenerateJob | AiEmbedJob;
export type AiJobResult = AiGenerateResult | AiEmbedResult;

export function mapAiGenerateJobToProcessInput(input: {
  readonly job: AiGenerateJob;
}): ConsumeAiGenerateJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    payload: input.job.data,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
  };
}

export function mapAiGenerateJobToCompleteInput(input: {
  readonly job: AiGenerateJob;
}): ConsumeAiGenerateJobCompleteInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: resolveDate({ timestamp: input.job.finishedOn }),
  };
}

export function mapAiGenerateJobToFailInput(input: {
  readonly job: AiGenerateJob;
  readonly error: Error;
}): ConsumeAiGenerateJobFailInput {
  const occurredAt = resolveDate({ timestamp: input.job.finishedOn });
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
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

export function mapMissingAiGenerateJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeAiGenerateJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobId = resolveMissingJobId({ occurredAt, jobName: AI_GENERATE_JOB_NAME });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId: jobId,
    attemptsMade: 0,
    enqueuedAt: occurredAt,
    finishedAt: occurredAt,
    occurredAt,
    reason: `worker_event_job_missing:${input.error.message.slice(0, 96)}`,
  };
}

export function mapAiEmbedJobToProcessInput(input: {
  readonly job: AiEmbedJob;
}): ConsumeAiEmbedJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    payload: input.job.data,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
  };
}

export function mapAiEmbedJobToCompleteInput(input: {
  readonly job: AiEmbedJob;
}): ConsumeAiEmbedJobCompleteInput {
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
    jobId,
    traceId: resolveTraceId({ jobId }),
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: resolveDate({ timestamp: input.job.finishedOn }),
  };
}

export function mapAiEmbedJobToFailInput(input: {
  readonly job: AiEmbedJob;
  readonly error: Error;
}): ConsumeAiEmbedJobFailInput {
  const occurredAt = resolveDate({ timestamp: input.job.finishedOn });
  const jobId = resolveJobId({ job: input.job });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
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

export function mapMissingAiEmbedJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeAiEmbedJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobId = resolveMissingJobId({ occurredAt, jobName: AI_EMBED_JOB_NAME });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
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

function resolveMaxAttempts(input: { readonly job: AiJob }): number | undefined {
  const attempts = input.job.opts.attempts;
  if (typeof attempts !== 'number' || Number.isNaN(attempts)) {
    return undefined;
  }
  return attempts;
}

function resolveJobId(input: { readonly job: AiJob }): string {
  if (typeof input.job.id === 'number') {
    return String(input.job.id);
  }
  return input.job.id ?? `${input.job.name}:${input.job.timestamp}`;
}

function resolveTraceId(input: { readonly jobId: string }): string {
  const prefixes: ReadonlyArray<string> = [`${AI_GENERATE_JOB_NAME}:`, `${AI_EMBED_JOB_NAME}:`];
  for (const prefix of prefixes) {
    if (input.jobId.startsWith(prefix)) {
      return input.jobId.slice(prefix.length);
    }
  }
  return input.jobId;
}

function resolveMissingJobId(input: {
  readonly occurredAt: Date;
  readonly jobName: string;
}): string {
  return `missing-job:${input.jobName}:${input.occurredAt.getTime()}`;
}
