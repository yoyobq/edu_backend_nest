// src/modules/common/ai-worker/ai-worker.service.ts
import { Injectable } from '@nestjs/common';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { AiProviderRegistry } from './providers/ai-provider-registry';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from './ai-worker.types';

@Injectable()
export class AiWorkerService {
  constructor(private readonly registry: AiProviderRegistry) {}

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    const provider = this.registry.getGenerateProvider(input.provider);
    if (!provider.generate) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        `unsupported_ai_generate_provider:${provider.name}`,
      );
    }
    return provider.generate(input);
  }

  async embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    const provider = this.registry.getEmbedProvider();
    if (!provider.embed) {
      throw new DomainError(
        THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
        `unsupported_ai_embed_provider:${provider.name}`,
      );
    }
    return provider.embed(input);
  }
}
