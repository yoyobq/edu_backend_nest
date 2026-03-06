import { Module } from '@nestjs/common';
import { EmailModule } from '@src/modules/common/email/email.module';
import { QueueEmailUsecase } from './queue-email.usecase';

@Module({
  imports: [EmailModule],
  providers: [QueueEmailUsecase],
  exports: [QueueEmailUsecase],
})
export class EmailUsecasesModule {}
