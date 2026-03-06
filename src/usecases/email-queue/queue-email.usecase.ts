import { Injectable } from '@nestjs/common';
import { EmailQueueService } from '@src/modules/common/email-queue/email-queue.service';
import type {
  QueueEmailInput,
  QueueEmailResult,
} from '@src/modules/common/email-queue/email-queue.types';

@Injectable()
export class QueueEmailUsecase {
  constructor(private readonly emailQueueService: EmailQueueService) {}

  async execute(input: QueueEmailInput): Promise<QueueEmailResult> {
    return this.emailQueueService.enqueueSend(input);
  }
}
