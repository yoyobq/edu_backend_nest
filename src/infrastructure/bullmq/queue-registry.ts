import type { JobsOptions } from 'bullmq';
import { BULLMQ_QUEUES, type BullMqQueueName } from './bullmq.constants';

export interface BullMqQueueRuntimePolicy {
  readonly concurrency: number;
  readonly limiter?: {
    readonly max: number;
    readonly duration: number;
  };
  readonly shutdownGraceMs: number;
}

export interface BullMqQueuePolicy {
  readonly queueName: BullMqQueueName;
  readonly defaultJobOptions: Readonly<
    Pick<JobsOptions, 'attempts' | 'backoff' | 'removeOnComplete' | 'removeOnFail'>
  >;
  readonly runtime: BullMqQueueRuntimePolicy;
}

export const BULLMQ_QUEUE_REGISTRY: Readonly<Record<BullMqQueueName, BullMqQueuePolicy>> = {
  [BULLMQ_QUEUES.INTEGRATION_EVENTS]: {
    queueName: BULLMQ_QUEUES.INTEGRATION_EVENTS,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
    runtime: {
      concurrency: 8,
      limiter: {
        max: 200,
        duration: 1000,
      },
      shutdownGraceMs: 15000,
    },
  },
};

export const BULLMQ_QUEUE_NAMES: ReadonlyArray<BullMqQueueName> = Object.values(BULLMQ_QUEUES);

export const BULLMQ_REGISTER_QUEUE_OPTIONS = BULLMQ_QUEUE_NAMES.map((queueName) => ({
  name: queueName,
}));
