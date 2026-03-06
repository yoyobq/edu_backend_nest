import { BULLMQ_JOBS, BULLMQ_QUEUES } from '../bullmq.constants';
import { isOptionalBoolean, isOptionalString, isRecord } from './shared-payload-validators';

export interface IntegrationEventsDispatchOutboxPayload {
  readonly trigger: 'timer' | 'manual';
  readonly tenantId?: string;
}

export interface IntegrationEventsRetryFailedOutboxPayload {
  readonly batchSize: number;
  readonly force?: boolean;
}

const isIntegrationEventsDispatchOutboxPayload = (
  payload: unknown,
): payload is IntegrationEventsDispatchOutboxPayload => {
  if (!isRecord(payload)) return false;
  const trigger = payload.trigger;
  return (trigger === 'timer' || trigger === 'manual') && isOptionalString(payload.tenantId);
};

const isIntegrationEventsRetryFailedOutboxPayload = (
  payload: unknown,
): payload is IntegrationEventsRetryFailedOutboxPayload => {
  if (!isRecord(payload)) return false;
  return typeof payload.batchSize === 'number' && isOptionalBoolean(payload.force);
};

export const INTEGRATION_EVENTS_JOB_CONTRACT = {
  [BULLMQ_JOBS.INTEGRATION_EVENTS.DISPATCH_OUTBOX]: {
    payload: {} as IntegrationEventsDispatchOutboxPayload,
    result: {
      accepted: true,
    } as const,
    payloadValidator: isIntegrationEventsDispatchOutboxPayload,
  },
  [BULLMQ_JOBS.INTEGRATION_EVENTS.RETRY_FAILED_OUTBOX]: {
    payload: {} as IntegrationEventsRetryFailedOutboxPayload,
    result: {
      accepted: true,
    } as const,
    payloadValidator: isIntegrationEventsRetryFailedOutboxPayload,
  },
} as const;

export const INTEGRATION_EVENTS_QUEUE_CONTRACT = {
  queueName: BULLMQ_QUEUES.INTEGRATION_EVENTS,
  jobs: INTEGRATION_EVENTS_JOB_CONTRACT,
} as const;
