import { Module } from '@nestjs/common';
import { AiWorkerUsecasesModule } from '@src/usecases/ai-worker/ai-worker-usecases.module';
import { AsyncTaskRecordUsecasesModule } from '@src/usecases/async-task-record/async-task-record-usecases.module';
import { AiJobHandler } from './ai-generate.handler';
import { AiGenerateProcessor } from './ai-generate.processor';

@Module({
  imports: [AiWorkerUsecasesModule, AsyncTaskRecordUsecasesModule],
  providers: [AiJobHandler, AiGenerateProcessor],
})
export class AiWorkerAdapterModule {}
