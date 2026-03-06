export const BULLMQ_QUEUES = {
  INTEGRATION_EVENTS: 'integration-events',
} as const;

export type BullMqQueueName = (typeof BULLMQ_QUEUES)[keyof typeof BULLMQ_QUEUES];

export const BULLMQ_JOBS = {
  INTEGRATION_EVENTS: {
    DISPATCH_OUTBOX: 'dispatch-outbox',
    RETRY_FAILED_OUTBOX: 'retry-failed-outbox',
  },
} as const;

export type BullMqIntegrationEventsJobName =
  (typeof BULLMQ_JOBS.INTEGRATION_EVENTS)[keyof typeof BULLMQ_JOBS.INTEGRATION_EVENTS];

export const BULLMQ_QUEUE_JOBS: Readonly<Record<BullMqQueueName, ReadonlyArray<string>>> = {
  [BULLMQ_QUEUES.INTEGRATION_EVENTS]: Object.values(BULLMQ_JOBS.INTEGRATION_EVENTS),
};
