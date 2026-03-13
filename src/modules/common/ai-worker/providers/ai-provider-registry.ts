// src/modules/common/ai-worker/providers/ai-provider-registry.ts
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProviderClient } from './ai-provider-client';
import { LocalMockAiProvider } from './local/local-mock-ai.provider';
import { OpenAiGenerateProvider } from './openai/openai-generate.provider';
import { QwenGenerateProvider } from './qwen/qwen-generate.provider';

@Injectable()
export class AiProviderRegistry {
  constructor(
    private readonly configService: ConfigService,
    private readonly localMockProvider: LocalMockAiProvider,
    private readonly openAiGenerateProvider: OpenAiGenerateProvider,
    private readonly qwenGenerateProvider: QwenGenerateProvider,
  ) {}

  getGenerateProvider(name?: string): AiProviderClient {
    return this.resolveProvider(name);
  }

  getEmbedProvider(name?: string): AiProviderClient {
    return this.resolveProvider(name);
  }

  private isMockMode(): boolean {
    const mode = this.configService.get<string>('aiWorker.providerMode', 'mock');
    return mode.trim().toLowerCase() === 'mock';
  }

  private resolveProviderName(inputProvider?: string): string {
    return inputProvider?.trim().toLowerCase() ?? '';
  }

  private resolveProvider(inputProvider?: string): AiProviderClient {
    if (this.isMockMode()) {
      return this.localMockProvider;
    }
    const providerName = this.resolveProviderName(inputProvider);
    if (!providerName) {
      return this.localMockProvider;
    }
    if (providerName === this.localMockProvider.name) {
      return this.localMockProvider;
    }
    if (providerName === this.openAiGenerateProvider.name) {
      return this.openAiGenerateProvider;
    }
    if (providerName === this.qwenGenerateProvider.name) {
      return this.qwenGenerateProvider;
    }
    throw new DomainError(
      THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
      `unsupported_ai_provider:${providerName}`,
    );
  }
}
