import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import type { QueueEmailInput, QueueEmailResult } from './email.types';

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
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        to: input.to,
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
}
