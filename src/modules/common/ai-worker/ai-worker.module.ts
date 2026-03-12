// src/modules/common/ai-worker/ai-worker.module.ts
import { Module } from '@nestjs/common';
import { AiWorkerService } from './ai-worker.service';

@Module({
  providers: [AiWorkerService],
  exports: [AiWorkerService],
})
export class AiWorkerModule {}
