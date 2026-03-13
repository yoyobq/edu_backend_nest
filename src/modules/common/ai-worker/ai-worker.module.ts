// src/modules/common/ai-worker/ai-worker.module.ts
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AiWorkerService } from './ai-worker.service';
import { AiProviderRegistry } from './providers/ai-provider-registry';
import { LocalMockAiProvider } from './providers/local-mock-ai.provider';
import { OpenAiGenerateProvider } from './providers/openai-generate.provider';
import { QwenGenerateProvider } from './providers/qwen-generate.provider';

@Module({
  imports: [HttpModule],
  providers: [
    AiWorkerService,
    AiProviderRegistry,
    LocalMockAiProvider,
    OpenAiGenerateProvider,
    QwenGenerateProvider,
  ],
  exports: [AiWorkerService],
})
export class AiWorkerModule {}
