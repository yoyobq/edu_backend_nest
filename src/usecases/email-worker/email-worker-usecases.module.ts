import { Module } from '@nestjs/common';
import { LogEmailWorkerStartUsecase } from './log-email-worker-start.usecase';

@Module({
  providers: [LogEmailWorkerStartUsecase],
  exports: [LogEmailWorkerStartUsecase],
})
export class EmailWorkerUsecasesModule {}
