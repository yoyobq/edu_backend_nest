import { BULLMQ_JOBS, BULLMQ_QUEUES, type BullMqQueueName } from './bullmq.constants';

export interface IntegrationEventsDispatchOutboxPayload {
  readonly trigger: 'timer' | 'manual';
  readonly tenantId?: string;
}

export interface IntegrationEventsRetryFailedOutboxPayload {
  readonly batchSize: number;
  readonly force?: boolean;
}

export interface EmailSendPayload {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly templateId?: string;
  readonly meta?: Readonly<Record<string, string>>;
}

type PayloadValidator<T> = (payload: unknown) => payload is T;

export interface BullMqJobContractMap {
  readonly [BULLMQ_QUEUES.INTEGRATION_EVENTS]: {
    readonly [BULLMQ_JOBS.INTEGRATION_EVENTS.DISPATCH_OUTBOX]: {
      readonly payload: IntegrationEventsDispatchOutboxPayload;
      readonly result: {
        readonly accepted: boolean;
      };
    };
    readonly [BULLMQ_JOBS.INTEGRATION_EVENTS.RETRY_FAILED_OUTBOX]: {
      readonly payload: IntegrationEventsRetryFailedOutboxPayload;
      readonly result: {
        readonly accepted: boolean;
      };
    };
  };
  readonly [BULLMQ_QUEUES.EMAIL]: {
    readonly [BULLMQ_JOBS.EMAIL.SEND]: {
      readonly payload: EmailSendPayload;
      readonly result: {
        readonly accepted: boolean;
        readonly providerMessageId: string;
      };
    };
  };
}

export type BullMqJobName<Q extends BullMqQueueName> = keyof BullMqJobContractMap[Q] & string;

type BullMqJobContractEntry<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = BullMqJobContractMap[Q][J] extends { readonly payload: unknown; readonly result: unknown }
  ? BullMqJobContractMap[Q][J]
  : never;

export type BullMqJobPayload<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = BullMqJobContractEntry<Q, J>['payload'];

export type BullMqJobResult<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = BullMqJobContractEntry<Q, J>['result'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isOptionalRecordOfString = (
  value: unknown,
): value is Readonly<Record<string, string>> => {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
};

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

const isEmailSendPayload = (payload: unknown): payload is EmailSendPayload => {
  if (!isRecord(payload)) return false;
  return (
    isNonEmptyString(payload.to) &&
    isNonEmptyString(payload.subject) &&
    isOptionalString(payload.text) &&
    isOptionalString(payload.html) &&
    isOptionalString(payload.templateId) &&
    isOptionalRecordOfString(payload.meta)
  );
};

export const BULLMQ_JOB_PAYLOAD_VALIDATORS = {
  [BULLMQ_QUEUES.INTEGRATION_EVENTS]: {
    [BULLMQ_JOBS.INTEGRATION_EVENTS.DISPATCH_OUTBOX]: isIntegrationEventsDispatchOutboxPayload,
    [BULLMQ_JOBS.INTEGRATION_EVENTS.RETRY_FAILED_OUTBOX]:
      isIntegrationEventsRetryFailedOutboxPayload,
  },
  [BULLMQ_QUEUES.EMAIL]: {
    [BULLMQ_JOBS.EMAIL.SEND]: isEmailSendPayload,
  },
} as const satisfies {
  readonly [Q in BullMqQueueName]: {
    readonly [J in BullMqJobName<Q>]: PayloadValidator<BullMqJobPayload<Q, J>>;
  };
};

const getPayloadValidator = <Q extends BullMqQueueName, J extends BullMqJobName<Q>>(input: {
  readonly queueName: Q;
  readonly jobName: J;
}): PayloadValidator<BullMqJobPayload<Q, J>> => {
  const validatorsByQueue = BULLMQ_JOB_PAYLOAD_VALIDATORS[input.queueName] as {
    readonly [K in BullMqJobName<Q>]: PayloadValidator<BullMqJobPayload<Q, K>>;
  };
  return validatorsByQueue[input.jobName] as PayloadValidator<BullMqJobPayload<Q, J>>;
};

export function assertBullMqJobPayload<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
>(input: {
  readonly queueName: Q;
  readonly jobName: J;
  readonly payload: unknown;
}): asserts input is {
  readonly queueName: Q;
  readonly jobName: J;
  readonly payload: BullMqJobPayload<Q, J>;
} {
  const validator = getPayloadValidator({ queueName: input.queueName, jobName: input.jobName });
  if (!validator(input.payload)) {
    throw new Error(`BullMQ job payload is invalid: ${input.queueName}/${input.jobName}`);
  }
}
