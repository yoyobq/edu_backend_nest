// src/infrastructure/bullmq/producer.gateway.ts
import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type JobsOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { BULLMQ_QUEUE_JOBS, type BullMqQueueName } from './bullmq.constants';
import {
  assertBullMqJobPayload,
  type BullMqJobName,
  type BullMqJobPayload,
} from './contracts/job-contract.registry';
import { BULLMQ_QUEUE_REGISTRY } from './queue-registry';

export type BullMqEnqueueSource =
  | 'user_action'
  | 'admin_action'
  | 'system'
  | 'cron'
  | 'domain_event'
  | 'webhook';

export interface BullMqEnqueueMeta {
  // 发起账号 ID、发起时承担的角色
  readonly actorAccountId?: number | string;
  readonly actorActiveRole?: string;
  // 目标对象
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string;
  // 触发来源、原因
  readonly source: BullMqEnqueueSource;
  readonly reason?: string;
  // 记录事件设定时间，即时任务应和当前时间一致，定时任务应和设置时间一致
  // ISO 8601 datetime string, e.g. "2023-01-01T00:00:00.000Z"
  readonly occurredAt?: string;
}

export interface EnqueueJobInput<Q extends BullMqQueueName, J extends BullMqJobName<Q>> {
  readonly queueName: Q;
  readonly jobName: J;
  readonly payload: BullMqJobPayload<Q, J>;
  readonly dedupKey?: string;
  readonly traceId?: string;
  readonly auditMeta?: BullMqEnqueueMeta;
  readonly options?: Readonly<Partial<JobsOptions>>;
}

export interface EnqueueJobResult<Q extends BullMqQueueName, J extends BullMqJobName<Q>> {
  readonly queueName: Q;
  readonly jobName: J;
  readonly jobId: string;
  readonly traceId: string;
  readonly auditMeta?: BullMqEnqueueMeta;
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
    const traceId = input.traceId?.trim() || randomUUID();
    const payload = this.attachResolvedTraceIdToPayload({
      queueName: input.queueName,
      payload: input.payload,
      traceId,
    });
    assertBullMqJobPayload({
      queueName: input.queueName,
      jobName: input.jobName,
      payload,
    });
    const queue = this.getQueue({ queueName: input.queueName });
    const dedupKey = input.dedupKey?.trim() || undefined;
    if (dedupKey) {
      const existingJob = await queue.getJob(dedupKey);
      if (existingJob) {
        const existingTraceId = this.readTraceIdFromPayload(existingJob.data);
        if (!existingTraceId) {
          throw new Error(
            `missing_existing_payload_trace_id:${input.queueName}/${input.jobName}:${dedupKey}`,
          );
        }
        const existingJobId =
          typeof existingJob.id === 'number'
            ? String(existingJob.id)
            : (existingJob.id ?? dedupKey);
        return {
          queueName: input.queueName,
          jobName: input.jobName,
          jobId: existingJobId,
          traceId: existingTraceId,
          auditMeta: input.auditMeta,
        };
      }
    }
    const jobId = dedupKey ?? randomUUID();
    const policy = BULLMQ_QUEUE_REGISTRY[input.queueName];
    const options: JobsOptions = {
      ...policy.defaultJobOptions,
      ...input.options,
      jobId,
    };
    await queue.add(input.jobName, payload, options);
    this.logger.info(
      {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId,
        traceId,
        auditMeta: input.auditMeta,
      },
      'BullMQ job enqueued',
    );
    return {
      queueName: input.queueName,
      jobName: input.jobName,
      jobId,
      traceId,
      auditMeta: input.auditMeta,
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

  private attachResolvedTraceIdToPayload<
    Q extends BullMqQueueName,
    J extends BullMqJobName<Q>,
  >(input: {
    readonly queueName: Q;
    readonly payload: BullMqJobPayload<Q, J>;
    readonly traceId: string;
  }): BullMqJobPayload<Q, J> {
    if (input.queueName !== 'ai' && input.queueName !== 'email') {
      return input.payload;
    }
    if (!this.isObjectRecord(input.payload)) {
      return input.payload;
    }
    return {
      ...(input.payload as Record<string, unknown>),
      traceId: input.traceId,
    } as BullMqJobPayload<Q, J>;
  }

  private readTraceIdFromPayload(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const traceId = (payload as Record<string, unknown>).traceId;
    if (typeof traceId !== 'string') {
      return undefined;
    }
    const normalized = traceId.trim();
    return normalized || undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
