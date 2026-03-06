import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailQueueService } from './email-queue.service';

@Module({
  imports: [BullMqModule],
  providers: [EmailQueueService, EmailDeliveryService],
  exports: [EmailQueueService, EmailDeliveryService],
})
export class EmailModule {}
