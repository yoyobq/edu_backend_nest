import { Module } from '@nestjs/common';
import { EmailUsecasesModule } from '@src/usecases/email/email-usecases.module';
import { EmailController } from './email.controller';

@Module({
  imports: [EmailUsecasesModule],
  controllers: [EmailController],
})
export class EmailAdapterModule {}
