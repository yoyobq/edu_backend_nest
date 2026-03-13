// src/modules/common/ai-worker/providers/ai-provider-client.ts
import type {
  EmbedAiContentInput,
  EmbedAiContentResult,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '../ai-worker.types';

export interface AiProviderClient {
  readonly name: string;
  generate?(input: GenerateAiContentInput): Promise<GenerateAiContentResult>;
  embed?(input: EmbedAiContentInput): Promise<EmbedAiContentResult>;
}
