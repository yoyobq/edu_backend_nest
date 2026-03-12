// src/infrastructure/bullmq/bullmq.constants.ts
export const BULLMQ_QUEUES = {
  INTEGRATION_EVENTS: 'integration-events',
  EMAIL: 'email',
  AI: 'ai',
} as const;

export type BullMqQueueName = (typeof BULLMQ_QUEUES)[keyof typeof BULLMQ_QUEUES];

export const BULLMQ_JOBS = {
  INTEGRATION_EVENTS: {
    DISPATCH_OUTBOX: 'dispatch-outbox',
    RETRY_FAILED_OUTBOX: 'retry-failed-outbox',
  },
  EMAIL: {
    SEND: 'send',
  },
  AI: {
    GENERATE: 'generate',
    EMBED: 'embed',
  },
} as const;

export type BullMqIntegrationEventsJobName =
  (typeof BULLMQ_JOBS.INTEGRATION_EVENTS)[keyof typeof BULLMQ_JOBS.INTEGRATION_EVENTS];

export type BullMqEmailJobName = (typeof BULLMQ_JOBS.EMAIL)[keyof typeof BULLMQ_JOBS.EMAIL];
export type BullMqAiJobName = (typeof BULLMQ_JOBS.AI)[keyof typeof BULLMQ_JOBS.AI];

export const BULLMQ_QUEUE_JOBS: Readonly<Record<BullMqQueueName, ReadonlyArray<string>>> = {
  [BULLMQ_QUEUES.INTEGRATION_EVENTS]: Object.values(BULLMQ_JOBS.INTEGRATION_EVENTS),
  [BULLMQ_QUEUES.EMAIL]: Object.values(BULLMQ_JOBS.EMAIL),
  [BULLMQ_QUEUES.AI]: Object.values(BULLMQ_JOBS.AI),
};
