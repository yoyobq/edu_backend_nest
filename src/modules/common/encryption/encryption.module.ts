// modules/common/encryption/encryption.module.ts
import { Module } from '@nestjs/common';
import { EncryptionHelper } from './encryption.helper';

@Module({
  providers: [EncryptionHelper],
  exports: [EncryptionHelper],
})
export class EncryptionModule {}
