import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import type { BullMqJobPayload, BullMqJobResult } from '@src/infrastructure/bullmq/job-contract';
import { BULLMQ_QUEUE_REGISTRY } from '@src/infrastructure/bullmq/queue-registry';
import { EmailDeliveryService } from '@src/modules/common/email/email-delivery.service';

type EmailQueueName = typeof BULLMQ_QUEUES.EMAIL;
type EmailSendJobName = typeof BULLMQ_JOBS.EMAIL.SEND;
type EmailSendPayload = BullMqJobPayload<EmailQueueName, EmailSendJobName>;
type EmailSendResult = BullMqJobResult<EmailQueueName, EmailSendJobName>;

@Injectable()
@Processor(BULLMQ_QUEUES.EMAIL, {
  concurrency: BULLMQ_QUEUE_REGISTRY[BULLMQ_QUEUES.EMAIL].runtime.concurrency,
})
export class EmailSendProcessor extends WorkerHost {
  constructor(
    private readonly deliveryService: EmailDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(EmailSendProcessor.name);
  }

  async process(job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>): Promise<EmailSendResult> {
    const result = await this.deliveryService.send(job.data);
    this.logger.info(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: job.id,
        to: job.data.to,
      },
      'Email queue job processed',
    );
    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>): void {
    this.logger.info(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: job.id,
      },
      'Email queue job completed',
    );
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName> | undefined,
    error: Error,
  ): void {
    this.logger.error(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: job?.id,
        errorMessage: error.message,
      },
      'Email queue job failed',
    );
  }
}
