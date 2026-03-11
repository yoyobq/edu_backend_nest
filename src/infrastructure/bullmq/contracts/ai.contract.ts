import { BULLMQ_JOBS, BULLMQ_QUEUES } from '../bullmq.constants';
import {
  isNonEmptyString,
  isOptionalNonEmptyString,
  isOptionalRecordOfString,
  isRecord,
} from './shared-payload-validators';

export type AiProvider = 'openai' | 'qwen' | 'deepseek' | 'kimi';

export interface AiGeneratePayload {
  readonly provider?: AiProvider;
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
  readonly provider?: AiProvider;
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiEmbedResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly providerJobId: string;
}

const AI_PROVIDERS: ReadonlyArray<AiProvider> = ['openai', 'qwen', 'deepseek', 'kimi'];

const isAiProvider = (value: string): value is AiProvider => {
  return AI_PROVIDERS.some((provider) => provider === value);
};

const isOptionalAiProvider = (value: unknown): value is AiProvider | undefined => {
  if (!isOptionalNonEmptyString(value)) {
    return false;
  }
  if (value === undefined) {
    return true;
  }
  return isAiProvider(value);
};

const isAiGeneratePayload = (payload: unknown): payload is AiGeneratePayload => {
  if (!isRecord(payload)) return false;
  return (
    isOptionalAiProvider(payload.provider) &&
    isNonEmptyString(payload.model) &&
    isNonEmptyString(payload.prompt) &&
    isOptionalRecordOfString(payload.metadata)
  );
};

const isAiEmbedPayload = (payload: unknown): payload is AiEmbedPayload => {
  if (!isRecord(payload)) return false;
  return (
    isOptionalAiProvider(payload.provider) &&
    isNonEmptyString(payload.model) &&
    isNonEmptyString(payload.text) &&
    isOptionalRecordOfString(payload.metadata)
  );
};

export const AI_JOB_CONTRACT = {
  [BULLMQ_JOBS.AI.GENERATE]: {
    payload: {} as AiGeneratePayload,
    result: {} as AiGenerateResult,
    payloadValidator: isAiGeneratePayload,
  },
  [BULLMQ_JOBS.AI.EMBED]: {
    payload: {} as AiEmbedPayload,
    result: {} as AiEmbedResult,
    payloadValidator: isAiEmbedPayload,
  },
} as const;

export const AI_QUEUE_CONTRACT = {
  queueName: BULLMQ_QUEUES.AI,
  jobs: AI_JOB_CONTRACT,
} as const;
