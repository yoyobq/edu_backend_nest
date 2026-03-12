// src/adapters/worker/ai/ai-worker-adapter.module.ts
import { Module } from '@nestjs/common';
import { AiWorkerUsecasesModule } from '@src/usecases/ai-worker/ai-worker-usecases.module';
import { AiJobHandler } from './ai-generate.handler';
import { AiGenerateProcessor } from './ai-generate.processor';

@Module({
  imports: [AiWorkerUsecasesModule],
  providers: [AiJobHandler, AiGenerateProcessor],
})
export class AiWorkerAdapterModule {}
