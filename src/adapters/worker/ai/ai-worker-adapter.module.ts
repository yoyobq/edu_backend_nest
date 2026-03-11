import { Module } from '@nestjs/common';
import { AiWorkerUsecasesModule } from '@src/usecases/ai-worker/ai-worker-usecases.module';
import { AiGenerateHandler } from './ai-generate.handler';
import { AiGenerateProcessor } from './ai-generate.processor';

@Module({
  imports: [AiWorkerUsecasesModule],
  providers: [AiGenerateHandler, AiGenerateProcessor],
})
export class AiWorkerAdapterModule {}
