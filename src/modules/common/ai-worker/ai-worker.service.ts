// src/modules/common/ai-worker/ai-worker.service.ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from './ai-worker.types';

@Injectable()
export class AiWorkerService {
  generate(input: GenerateAiContentInput): GenerateAiContentResult {
    const normalizedPrompt = input.prompt.trim();
    const outputText = normalizedPrompt.length > 0 ? normalizedPrompt : '[empty_prompt]';
    const provider = input.provider?.trim() || 'default';
    const providerJobId = this.buildProviderJobId({
      provider,
      model: input.model,
      content: normalizedPrompt,
    });
    return {
      accepted: true,
      outputText,
      providerJobId,
    };
  }

  embed(input: EmbedAiContentInput): EmbedAiContentResult {
    const normalizedText = input.text.trim();
    const provider = input.provider?.trim() || 'default';
    const providerJobId = this.buildProviderJobId({
      provider,
      model: input.model,
      content: normalizedText,
    });
    return {
      accepted: true,
      vector: this.buildVector({ model: input.model, text: normalizedText }),
      providerJobId,
    };
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
