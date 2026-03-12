import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { QueueAiUsecase } from '@src/usecases/ai-queue/queue-ai.usecase';
import { QueueAiEmbedInput } from './dto/queue-ai-embed.input';
import { QueueAiGenerateInput } from './dto/queue-ai-generate.input';
import { QueueAiResult } from './dto/queue-ai.result';

@Resolver()
export class AiResolver {
  constructor(private readonly queueAiUsecase: QueueAiUsecase) {}

  @Mutation(() => QueueAiResult, { description: '将 AI 生成请求加入队列' })
  @ValidateInput()
  async queueAiGenerate(@Args('input') input: QueueAiGenerateInput): Promise<QueueAiResult> {
    this.ensureNotProduction();
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

  @Mutation(() => QueueAiResult, { description: '将 AI 向量化请求加入队列' })
  @ValidateInput()
  async queueAiEmbed(@Args('input') input: QueueAiEmbedInput): Promise<QueueAiResult> {
    this.ensureNotProduction();
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

  private ensureNotProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '生产环境禁用 AI 队列调试入口');
    }
  }
}
