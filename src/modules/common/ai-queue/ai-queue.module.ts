// src/modules/common/ai-queue/ai-queue.module.ts
import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AiQueueService } from './ai-queue.service';

@Module({
  imports: [BullMqModule],
  providers: [AiQueueService],
  exports: [AiQueueService],
})
export class AiQueueModule {}
