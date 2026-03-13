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

// 当前公开链路中，embed 不暴露 provider 语义。
// 这里保留 provider 字段，仅用于内部兼容与未来扩展。
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
