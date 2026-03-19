// src/usecases/ai-worker/ai-worker-usecases.module.ts
import { Module } from '@nestjs/common';
import { AiProviderCallRecordModule } from '@src/modules/ai-provider-call-record/ai-provider-call-record.module';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { AiWorkerModule } from '@src/modules/common/ai-worker/ai-worker.module';
import { ConsumeAiEmbedJobUsecase, ConsumeAiGenerateJobUsecase } from './consume-ai-job.usecase';

@Module({
  imports: [AiWorkerModule, AsyncTaskRecordModule, AiProviderCallRecordModule],
  providers: [ConsumeAiGenerateJobUsecase, ConsumeAiEmbedJobUsecase],
  exports: [ConsumeAiGenerateJobUsecase, ConsumeAiEmbedJobUsecase],
})
export class AiWorkerUsecasesModule {}
