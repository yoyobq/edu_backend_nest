import { Module } from '@nestjs/common';
import { AiWorkerModule } from '@src/modules/common/ai-worker/ai-worker.module';
import { AsyncTaskRecordUsecasesModule } from '@src/usecases/async-task-record/async-task-record-usecases.module';
import { ConsumeAiGenerateJobUsecase } from './consume-ai-generate-job.usecase';

@Module({
  imports: [AiWorkerModule, AsyncTaskRecordUsecasesModule],
  providers: [ConsumeAiGenerateJobUsecase],
  exports: [ConsumeAiGenerateJobUsecase],
})
export class AiWorkerUsecasesModule {}
