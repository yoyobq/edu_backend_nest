import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { GenerateAiContentInput, GenerateAiContentResult } from './ai-worker.types';

@Injectable()
export class AiWorkerService {
  generate(input: GenerateAiContentInput): GenerateAiContentResult {
    const normalizedPrompt = input.prompt.trim();
    const outputText = normalizedPrompt.length > 0 ? normalizedPrompt : '[empty_prompt]';
    const provider = input.provider?.trim() || 'default';
    const providerJobId = this.buildProviderJobId({
      provider,
      model: input.model,
      prompt: normalizedPrompt,
    });
    return {
      accepted: true,
      outputText,
      providerJobId,
    };
  }

  private buildProviderJobId(input: {
    readonly provider: string;
    readonly model: string;
    readonly prompt: string;
  }): string {
    const digest = createHash('sha256').update(`${input.model}:${input.prompt}`).digest('hex');
    return `${input.provider}:${digest.slice(0, 24)}`;
  }
}
