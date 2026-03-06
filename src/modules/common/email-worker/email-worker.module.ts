import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailSendHandler } from './email-send.handler';
import { EmailSendProcessor } from './email-send.processor';

@Module({
  imports: [BullMqModule],
  providers: [EmailDeliveryService, EmailSendHandler, EmailSendProcessor],
})
export class EmailWorkerModule {}
