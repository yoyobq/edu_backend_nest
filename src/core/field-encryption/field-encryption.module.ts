import { Module } from '@nestjs/common';
import { FieldEncryptionService } from './field-encryption.service';
import { FieldEncryptionSubscriber } from './field-encryption.subscriber';

@Module({
  providers: [FieldEncryptionService, FieldEncryptionSubscriber],
  exports: [FieldEncryptionService, FieldEncryptionSubscriber], // 导出 subscriber
})
export class FieldEncryptionModule {}
