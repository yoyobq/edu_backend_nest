import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import type {
  BullMqJobPayload,
  BullMqJobResult,
} from '@src/infrastructure/bullmq/contracts/job-contract.registry';
import { BULLMQ_QUEUE_REGISTRY } from '@src/infrastructure/bullmq/queue-registry';
import type { Job } from 'bullmq';
import { EmailSendHandler } from './email-send.handler';

type EmailQueueName = typeof BULLMQ_QUEUES.EMAIL;
type EmailSendJobName = typeof BULLMQ_JOBS.EMAIL.SEND;
type EmailSendPayload = BullMqJobPayload<EmailQueueName, EmailSendJobName>;
type EmailSendResult = BullMqJobResult<EmailQueueName, EmailSendJobName>;

@Injectable()
@Processor(BULLMQ_QUEUES.EMAIL, {
  concurrency: BULLMQ_QUEUE_REGISTRY[BULLMQ_QUEUES.EMAIL].runtime.concurrency,
  limiter: BULLMQ_QUEUE_REGISTRY[BULLMQ_QUEUES.EMAIL].runtime.limiter,
})
export class EmailSendProcessor extends WorkerHost {
  constructor(private readonly handler: EmailSendHandler) {
    super();
  }

  async process(
    job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>,
  ): Promise<EmailSendResult> {
    return this.handler.process({ job });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>): void {
    this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName> | undefined,
    error: Error,
  ): void {
    this.handler.onFailed({ job, error });
  }
}
