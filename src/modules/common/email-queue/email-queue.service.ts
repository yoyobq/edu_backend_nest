// src/modules/common/email-queue/email-queue.service.ts
import { Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { PinoLogger } from 'nestjs-pino';
import type { QueueEmailInput, QueueEmailResult } from './email-queue.types';

@Injectable()
export class EmailQueueService {
  constructor(
    private readonly producer: BullMqProducerGateway,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailQueueService.name);
  }

  async enqueueSend(input: QueueEmailInput): Promise<QueueEmailResult> {
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.EMAIL,
      jobName: BULLMQ_JOBS.EMAIL.SEND,
      payload: {
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        templateId: input.templateId,
        meta: input.meta,
        traceId: input.traceId,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        to: this.maskEmail(input.to),
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'Email job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const [localPart, domainPart] = parts;
    if (localPart.length <= 2) {
      return `${localPart.charAt(0) || '*'}***@${domainPart}`;
    }
    return `${localPart.slice(0, 2)}***@${domainPart}`;
  }
}
