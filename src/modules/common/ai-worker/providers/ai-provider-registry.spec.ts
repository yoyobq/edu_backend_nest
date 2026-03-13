// src/modules/common/ai-worker/providers/ai-provider-registry.spec.ts
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ConfigService } from '@nestjs/config';
import { AiProviderRegistry } from './ai-provider-registry';
import { LocalMockAiProvider } from './local/local-mock-ai.provider';
import { OpenAiGenerateProvider } from './openai/openai-generate.provider';
import { QwenGenerateProvider } from './qwen/qwen-generate.provider';

describe('AiProviderRegistry', () => {
  const buildRegistry = (input: { mode: string }) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'aiWorker.providerMode') {
          return input.mode;
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;
    const localMockProvider = { name: 'mock' } as LocalMockAiProvider;
    const openAiGenerateProvider = { name: 'openai' } as OpenAiGenerateProvider;
    const qwenGenerateProvider = { name: 'qwen' } as QwenGenerateProvider;
    return new AiProviderRegistry(
      configService,
      localMockProvider,
      openAiGenerateProvider,
      qwenGenerateProvider,
    );
  };

  it('AI_PROVIDER_MODE 为 mock 时始终返回 mock provider', () => {
    const registry = buildRegistry({ mode: 'mock' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('mock');
  });

  it('AI_PROVIDER_MODE 为 remote 时按入参 provider 路由', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('openai');
  });

  it('AI_PROVIDER_MODE 为 remote 且未传 provider 时走 mock', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider();
    expect(provider.name).toBe('mock');
  });

  it('AI_PROVIDER_MODE 为 remote 时支持 qwen provider', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('qwen');
    expect(provider.name).toBe('qwen');
  });

  it('AI_PROVIDER_MODE 为 remote 时支持 openai provider', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getGenerateProvider('openai');
    expect(provider.name).toBe('openai');
  });

  it('embed 在 remote 模式且未传 provider 时走 mock', () => {
    const registry = buildRegistry({ mode: 'remote' });
    const provider = registry.getEmbedProvider();
    expect(provider.name).toBe('mock');
  });

  it('embed 在 remote 模式且显式传 provider 时按入参路由', () => {
    const registry = buildRegistry({ mode: 'remote' });
    expect(registry.getEmbedProvider('qwen').name).toBe('qwen');
    expect(registry.getEmbedProvider('openai').name).toBe('openai');
  });

  it('不支持的 provider 抛出明确错误', () => {
    const registry = buildRegistry({ mode: 'remote' });
    expect(() => registry.getGenerateProvider('unknown')).toThrow(DomainError);
    expect(() => registry.getGenerateProvider('unknown')).toThrow(
      `unsupported_ai_provider:unknown`,
    );
    try {
      registry.getGenerateProvider('unknown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED);
    }
  });
});
