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

// 当前 embed 不支持 provider 选择，统一走固定能力路由。
export interface EmbedAiContentInput {
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface EmbedAiContentResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly providerJobId: string;
}
