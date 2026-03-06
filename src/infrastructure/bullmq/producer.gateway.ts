import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type JobsOptions, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { assertBullMqJobPayload, type BullMqJobName, type BullMqJobPayload } from './job-contract';
import { BULLMQ_QUEUE_JOBS, type BullMqQueueName } from './bullmq.constants';
import { BULLMQ_QUEUE_REGISTRY } from './queue-registry';

export interface EnqueueJobInput<Q extends BullMqQueueName, J extends BullMqJobName<Q>> {
  readonly queueName: Q;
  readonly jobName: J;
  readonly payload: BullMqJobPayload<Q, J>;
  readonly dedupKey?: string;
  readonly traceId?: string;
  readonly options?: Readonly<Partial<JobsOptions>>;
}

export interface EnqueueJobResult<Q extends BullMqQueueName, J extends BullMqJobName<Q>> {
  readonly queueName: Q;
  readonly jobName: J;
  readonly jobId: string;
  readonly traceId: string;
}

@Injectable()
export class BullMqProducerGateway {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BullMqProducerGateway.name);
  }

  async enqueue<Q extends BullMqQueueName, J extends BullMqJobName<Q>>(
    input: EnqueueJobInput<Q, J>,
  ): Promise<EnqueueJobResult<Q, J>> {
    this.assertQueueJobPair({ queueName: input.queueName, jobName: input.jobName });
    assertBullMqJobPayload({
      queueName: input.queueName,
      jobName: input.jobName,
      payload: input.payload,
    });
    const queue = this.getQueue({ queueName: input.queueName });
    const traceId = input.traceId ?? randomUUID();
    const jobId = input.dedupKey ?? `${String(input.jobName)}:${traceId}`;
    const policy = BULLMQ_QUEUE_REGISTRY[input.queueName];
    const options: JobsOptions = {
      ...policy.defaultJobOptions,
      ...input.options,
      jobId,
    };
    await queue.add(input.jobName, input.payload, options);
    this.logger.info(
      {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId,
        traceId,
      },
      'BullMQ job enqueued',
    );
    return {
      queueName: input.queueName,
      jobName: input.jobName,
      jobId,
      traceId,
    };
  }

  private getQueue(input: { readonly queueName: BullMqQueueName }): Queue {
    const token = getQueueToken(input.queueName);
    const queue = this.moduleRef.get<Queue>(token, { strict: false });
    if (!queue) {
      throw new Error(`BullMQ queue is not registered: ${input.queueName}`);
    }
    return queue;
  }

  private assertQueueJobPair<Q extends BullMqQueueName, J extends string>(input: {
    readonly queueName: Q;
    readonly jobName: J;
  }): void {
    const allowedJobs = BULLMQ_QUEUE_JOBS[input.queueName];
    if (!allowedJobs.includes(input.jobName)) {
      throw new Error(`BullMQ job is not registered in queue: ${input.queueName}/${input.jobName}`);
    }
  }
}
