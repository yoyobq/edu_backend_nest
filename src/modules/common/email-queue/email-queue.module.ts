// src/modules/common/email-queue/email-queue.module.ts
import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { EmailQueueService } from './email-queue.service';

@Module({
  imports: [BullMqModule],
  providers: [EmailQueueService],
  exports: [EmailQueueService],
})
export class EmailQueueModule {}
