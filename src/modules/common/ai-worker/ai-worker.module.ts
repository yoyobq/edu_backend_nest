// src/modules/common/ai-worker/ai-worker.module.ts
import { Module } from '@nestjs/common';
import { AiInfrastructureModule } from '@src/infrastructure/ai/ai-infrastructure.module';
import { AiWorkerService } from './ai-worker.service';
import { AiProviderRegistry } from './providers/ai-provider-registry';

@Module({
  imports: [AiInfrastructureModule],
  providers: [AiWorkerService, AiProviderRegistry],
  exports: [AiWorkerService],
})
export class AiWorkerModule {}
