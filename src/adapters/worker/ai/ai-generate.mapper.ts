// src/adapters/worker/ai/ai-generate.mapper.ts
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
  readonly traceId?: string;
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
  readonly traceId?: string;
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
export type AiFailedJob = Job<Record<string, unknown>, unknown, string>;

export function mapAiGenerateJobToProcessInput(input: {
  readonly job: AiGenerateJob;
}): ConsumeAiGenerateJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId,
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
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId,
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
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'degraded',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_GENERATE_JOB_NAME,
    jobId,
    traceId,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: occurredAt,
    occurredAt,
    reason: input.error.message.slice(0, 128),
  };
}

export function mapMissingAiJobToFailInput(input: {
  readonly error: Error;
  readonly occurredAt?: Date;
}): ConsumeAiGenerateJobFailInput {
  const occurredAt = input.occurredAt ?? new Date();
  const jobName = 'unknown';
  const jobId = resolveMissingJobId({ occurredAt, jobName });
  return {
    queueName: AI_QUEUE_NAME,
    jobName,
    jobId,
    traceId: jobId,
    bizType: 'ai_worker',
    bizKey: jobId,
    attemptsMade: 0,
    enqueuedAt: occurredAt,
    finishedAt: occurredAt,
    occurredAt,
    reason: `worker_event_job_missing:${input.error.message.slice(0, 96)}`,
  };
}

export function mapUnknownAiJobToFailInput(input: {
  readonly job: AiFailedJob;
  readonly error: Error;
}): ConsumeAiGenerateJobFailInput {
  const occurredAt = resolveDate({ timestamp: input.job.finishedOn }) ?? new Date();
  const jobName = resolveFailedJobName({ job: input.job });
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'degraded',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName,
    jobId,
    traceId,
    bizType: 'ai_worker',
    bizKey: traceId,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: occurredAt,
    occurredAt,
    reason: `unsupported_ai_job:${jobName}:${input.error.message.slice(0, 96)}`,
  };
}

export function mapAiEmbedJobToProcessInput(input: {
  readonly job: AiEmbedJob;
}): ConsumeAiEmbedJobProcessInput {
  const jobId = resolveJobId({ job: input.job });
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
    jobId,
    traceId,
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
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'strict',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
    jobId,
    traceId,
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
  const traceId = resolveTraceId({
    job: input.job,
    mode: 'degraded',
  });
  return {
    queueName: AI_QUEUE_NAME,
    jobName: AI_EMBED_JOB_NAME,
    jobId,
    traceId,
    attemptsMade: input.job.attemptsMade,
    maxAttempts: resolveMaxAttempts({ job: input.job }),
    enqueuedAt: resolveDate({ timestamp: input.job.timestamp }),
    startedAt: resolveDate({ timestamp: input.job.processedOn }),
    finishedAt: occurredAt,
    occurredAt,
    reason: input.error.message.slice(0, 128),
  };
}

function resolveDate(input: { readonly timestamp?: number }): Date | undefined {
  if (typeof input.timestamp !== 'number' || Number.isNaN(input.timestamp)) {
    return undefined;
  }
  return new Date(input.timestamp);
}

function resolveMaxAttempts(input: { readonly job: AiJob | AiFailedJob }): number | undefined {
  const attempts = input.job.opts.attempts;
  if (typeof attempts !== 'number' || Number.isNaN(attempts)) {
    return undefined;
  }
  return attempts;
}

function resolveJobId(input: { readonly job: AiJob | AiFailedJob }): string {
  if (typeof input.job.id === 'number') {
    return String(input.job.id);
  }
  return input.job.id ?? `${input.job.name}:${input.job.timestamp}`;
}

function resolveTraceId(input: {
  readonly job: AiJob | AiFailedJob;
  readonly mode: 'strict' | 'degraded';
}): string {
  const payloadTraceId = resolvePayloadTraceId({ job: input.job });
  if (payloadTraceId) {
    return payloadTraceId;
  }
  if (input.mode === 'strict') {
    throw new Error(`missing_payload_trace_id:${input.job.name}`);
  }
  const jobId = resolveJobId({ job: input.job });
  return `degraded-trace:${input.job.name}:${jobId}`;
}

function resolvePayloadTraceId(input: { readonly job: AiJob | AiFailedJob }): string | undefined {
  const payload = input.job.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const traceId = payload.traceId;
  if (typeof traceId !== 'string') {
    return undefined;
  }
  const normalizedTraceId = traceId.trim();
  return normalizedTraceId || undefined;
}

function resolveFailedJobName(input: { readonly job: AiFailedJob }): string {
  const normalizedName = input.job.name.trim();
  return normalizedName || 'unknown';
}

function resolveMissingJobId(input: {
  readonly occurredAt: Date;
  readonly jobName: string;
}): string {
  return `missing-job:${input.jobName}:${input.occurredAt.getTime()}`;
}
