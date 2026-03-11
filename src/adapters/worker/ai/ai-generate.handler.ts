import { Injectable } from '@nestjs/common';
import {
  ConsumeAiEmbedJobUsecase,
  ConsumeAiGenerateJobUsecase,
} from '@src/usecases/ai-worker/consume-ai-generate-job.usecase';
import {
  type AiEmbedJob,
  type AiEmbedResult,
  type AiGenerateJob,
  type AiGenerateResult,
  mapAiEmbedJobToCompleteInput,
  mapAiEmbedJobToFailInput,
  mapAiEmbedJobToProcessInput,
  mapAiGenerateJobToCompleteInput,
  mapAiGenerateJobToFailInput,
  mapAiGenerateJobToProcessInput,
  mapMissingAiEmbedJobToFailInput,
  mapMissingAiGenerateJobToFailInput,
} from './ai-generate.mapper';

@Injectable()
export class AiJobHandler {
  constructor(
    private readonly consumeAiGenerateJobUsecase: ConsumeAiGenerateJobUsecase,
    private readonly consumeAiEmbedJobUsecase: ConsumeAiEmbedJobUsecase,
  ) {}

  async processGenerate(input: { readonly job: AiGenerateJob }): Promise<AiGenerateResult> {
    return await this.consumeAiGenerateJobUsecase.process(
      mapAiGenerateJobToProcessInput({ job: input.job }),
    );
  }

  async processEmbed(input: { readonly job: AiEmbedJob }): Promise<AiEmbedResult> {
    return await this.consumeAiEmbedJobUsecase.process(
      mapAiEmbedJobToProcessInput({ job: input.job }),
    );
  }

  async onGenerateCompleted(input: { readonly job: AiGenerateJob }): Promise<void> {
    await this.consumeAiGenerateJobUsecase.complete(
      mapAiGenerateJobToCompleteInput({ job: input.job }),
    );
  }

  async onEmbedCompleted(input: { readonly job: AiEmbedJob }): Promise<void> {
    await this.consumeAiEmbedJobUsecase.complete(mapAiEmbedJobToCompleteInput({ job: input.job }));
  }

  async onGenerateFailed(input: {
    readonly job: AiGenerateJob | undefined;
    readonly error: Error;
  }): Promise<void> {
    if (!input.job) {
      await this.consumeAiGenerateJobUsecase.fail(
        mapMissingAiGenerateJobToFailInput({ error: input.error }),
      );
      return;
    }
    await this.consumeAiGenerateJobUsecase.fail(
      mapAiGenerateJobToFailInput({ job: input.job, error: input.error }),
    );
  }

  async onEmbedFailed(input: {
    readonly job: AiEmbedJob | undefined;
    readonly error: Error;
  }): Promise<void> {
    if (!input.job) {
      await this.consumeAiEmbedJobUsecase.fail(
        mapMissingAiEmbedJobToFailInput({ error: input.error }),
      );
      return;
    }
    await this.consumeAiEmbedJobUsecase.fail(
      mapAiEmbedJobToFailInput({ job: input.job, error: input.error }),
    );
  }
}
