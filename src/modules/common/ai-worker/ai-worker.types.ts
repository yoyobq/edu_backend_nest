// src/modules/common/ai-worker/ai-worker.types.ts
export interface GenerateAiContentInput {
  readonly provider?: string;
  readonly model: string;
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface GenerateAiContentResult {
  readonly accepted: boolean;
  readonly outputText: string;
  readonly providerJobId: string;
}

export interface EmbedAiContentInput {
  readonly provider?: string;
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface EmbedAiContentResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly providerJobId: string;
}
