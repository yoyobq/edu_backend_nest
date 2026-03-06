import { Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import type {
  BullMqJobPayload,
  BullMqJobResult,
} from '@src/infrastructure/bullmq/contracts/job-contract.registry';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { EmailDeliveryService } from './email-delivery.service';

type EmailQueueName = typeof BULLMQ_QUEUES.EMAIL;
type EmailSendJobName = typeof BULLMQ_JOBS.EMAIL.SEND;
type EmailSendPayload = BullMqJobPayload<EmailQueueName, EmailSendJobName>;
type EmailSendResult = BullMqJobResult<EmailQueueName, EmailSendJobName>;

@Injectable()
export class EmailSendHandler {
  constructor(
    private readonly deliveryService: EmailDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailSendHandler.name);
  }

  async process(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>;
  }): Promise<EmailSendResult> {
    const result = await this.deliveryService.send(input.job.data);
    this.logger.info(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: input.job.id,
        to: this.maskEmail({ email: input.job.data.to }),
        attemptsMade: input.job.attemptsMade,
      },
      'Email queue job processed',
    );
    return result;
  }

  onCompleted(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName>;
  }): void {
    this.logger.info(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: input.job.id,
        attemptsMade: input.job.attemptsMade,
      },
      'Email queue job completed',
    );
  }

  onFailed(input: {
    readonly job: Job<EmailSendPayload, EmailSendResult, EmailSendJobName> | undefined;
    readonly error: Error;
  }): void {
    this.logger.error(
      {
        queueName: BULLMQ_QUEUES.EMAIL,
        jobName: BULLMQ_JOBS.EMAIL.SEND,
        jobId: input.job?.id,
        attemptsMade: input.job?.attemptsMade,
        errorMessage: input.error.message,
      },
      'Email queue job failed',
    );
  }

  private maskEmail(input: { readonly email: string }): string {
    const parts = input.email.split('@');
    if (parts.length !== 2) return '***';
    const [localPart, domainPart] = parts;
    if (localPart.length <= 2) {
      return `${localPart.charAt(0) || '*'}***@${domainPart}`;
    }
    return `${localPart.slice(0, 2)}***@${domainPart}`;
  }
}
