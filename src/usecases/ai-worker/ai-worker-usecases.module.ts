// src/usecases/ai-worker/ai-worker-usecases.module.ts
import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { AiWorkerModule } from '@src/modules/common/ai-worker/ai-worker.module';
import {
  ConsumeAiEmbedJobUsecase,
  ConsumeAiGenerateJobUsecase,
} from './consume-ai-generate-job.usecase';

@Module({
  imports: [AiWorkerModule, AsyncTaskRecordModule],
  providers: [ConsumeAiGenerateJobUsecase, ConsumeAiEmbedJobUsecase],
  exports: [ConsumeAiGenerateJobUsecase, ConsumeAiEmbedJobUsecase],
})
export class AiWorkerUsecasesModule {}
