// src/adapters/api/graphql/ai/ai.resolver.ts
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { qmWorkerEntry } from '@src/adapters/api/graphql/decorators/qm-worker-entry.decorator';
import { QueueAiUsecase } from '@src/usecases/ai-queue/queue-ai.usecase';
import { QueueAiEmbedInput } from './dto/queue-ai-embed.input';
import { QueueAiGenerateInput } from './dto/queue-ai-generate.input';
import { QueueAiResult } from './dto/queue-ai.result';

@Resolver()
export class AiResolver {
  constructor(private readonly queueAiUsecase: QueueAiUsecase) {}

  @qmWorkerEntry('AI_STRICT')
  @Mutation(() => QueueAiResult, { description: '将 AI 生成请求加入队列' })
  @ValidateInput()
  async queueAiGenerate(@Args('input') input: QueueAiGenerateInput): Promise<QueueAiResult> {
    const result = await this.queueAiUsecase.executeGenerate({
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      metadata: input.metadata,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }

  @qmWorkerEntry('AI_STRICT')
  @Mutation(() => QueueAiResult, { description: '将 AI 向量化请求加入队列' })
  @ValidateInput()
  async queueAiEmbed(@Args('input') input: QueueAiEmbedInput): Promise<QueueAiResult> {
    const result = await this.queueAiUsecase.executeEmbed({
      provider: input.provider,
      model: input.model,
      text: input.text,
      metadata: input.metadata,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }
}
