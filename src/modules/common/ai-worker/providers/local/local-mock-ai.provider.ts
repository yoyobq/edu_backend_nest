// src/modules/common/ai-worker/providers/local/local-mock-ai.provider.ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AiProviderClient } from '../ai-provider-client';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '../../ai-worker.types';

@Injectable()
export class LocalMockAiProvider implements AiProviderClient {
  readonly name = 'mock';

  generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    const normalizedPrompt = input.prompt.trim();
    const outputText = normalizedPrompt.length > 0 ? normalizedPrompt : '[empty_prompt]';
    const providerJobId = this.buildProviderJobId({
      provider: this.name,
      model: input.model,
      content: normalizedPrompt,
    });
    return Promise.resolve({
      accepted: true,
      outputText,
      providerJobId,
    });
  }

  embed(input: EmbedAiContentInput): Promise<EmbedAiContentResult> {
    const normalizedText = input.text.trim();
    const providerJobId = this.buildProviderJobId({
      provider: this.name,
      model: input.model,
      content: normalizedText,
    });
    return Promise.resolve({
      accepted: true,
      vector: this.buildVector({ model: input.model, text: normalizedText }),
      providerJobId,
    });
  }

  private buildProviderJobId(input: {
    readonly provider: string;
    readonly model: string;
    readonly content: string;
  }): string {
    const digest = createHash('sha256').update(`${input.model}:${input.content}`).digest('hex');
    return `${input.provider}:${digest.slice(0, 24)}`;
  }

  private buildVector(input: {
    readonly model: string;
    readonly text: string;
  }): ReadonlyArray<number> {
    const digest = createHash('sha256').update(`${input.model}:${input.text}`).digest();
    return [digest[0] / 255, digest[1] / 255, digest[2] / 255, digest[3] / 255];
  }
}
