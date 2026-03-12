// src/modules/common/email-worker/email-worker.module.ts
import { Module } from '@nestjs/common';
import { EmailDeliveryService } from './email-delivery.service';

@Module({
  providers: [EmailDeliveryService],
  exports: [EmailDeliveryService],
})
export class EmailWorkerModule {}
