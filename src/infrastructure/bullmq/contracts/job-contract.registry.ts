import { BULLMQ_JOBS, BULLMQ_QUEUES, type BullMqQueueName } from '../bullmq.constants';
import { AI_JOB_CONTRACT } from './ai.contract';
import { EMAIL_JOB_CONTRACT } from './email.contract';
import { INTEGRATION_EVENTS_JOB_CONTRACT } from './integration-events.contract';

type PayloadValidator<T> = (payload: unknown) => payload is T;

type QueueJobContractMap = {
  readonly [BULLMQ_QUEUES.INTEGRATION_EVENTS]: typeof INTEGRATION_EVENTS_JOB_CONTRACT;
  readonly [BULLMQ_QUEUES.EMAIL]: typeof EMAIL_JOB_CONTRACT;
  readonly [BULLMQ_QUEUES.AI]: typeof AI_JOB_CONTRACT;
};

export type BullMqJobName<Q extends BullMqQueueName> = keyof QueueJobContractMap[Q] & string;

type BullMqJobContractEntry<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = QueueJobContractMap[Q][J] extends { readonly payload: unknown; readonly result: unknown }
  ? QueueJobContractMap[Q][J]
  : never;

export type BullMqJobPayload<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = BullMqJobContractEntry<Q, J>['payload'];

export type BullMqJobResult<
  Q extends BullMqQueueName,
  J extends BullMqJobName<Q>,
> = BullMqJobContractEntry<Q, J>['result'];

export const BULLMQ_JOB_PAYLOAD_VALIDATORS = {
  [BULLMQ_QUEUES.INTEGRATION_EVENTS]: {
    [BULLMQ_JOBS.INTEGRATION_EVENTS.DISPATCH_OUTBOX]:
      INTEGRATION_EVENTS_JOB_CONTRACT[BULLMQ_JOBS.INTEGRATION_EVENTS.DISPATCH_OUTBOX]
        .payloadValidator,
    [BULLMQ_JOBS.INTEGRATION_EVENTS.RETRY_FAILED_OUTBOX]:
      INTEGRATION_EVENTS_JOB_CONTRACT[BULLMQ_JOBS.INTEGRATION_EVENTS.RETRY_FAILED_OUTBOX]
        .payloadValidator,
  },
  [BULLMQ_QUEUES.EMAIL]: {
    [BULLMQ_JOBS.EMAIL.SEND]: EMAIL_JOB_CONTRACT[BULLMQ_JOBS.EMAIL.SEND].payloadValidator,
  },
  [BULLMQ_QUEUES.AI]: {
    [BULLMQ_JOBS.AI.GENERATE]: AI_JOB_CONTRACT[BULLMQ_JOBS.AI.GENERATE].payloadValidator,
    [BULLMQ_JOBS.AI.EMBED]: AI_JOB_CONTRACT[BULLMQ_JOBS.AI.EMBED].payloadValidator,
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
