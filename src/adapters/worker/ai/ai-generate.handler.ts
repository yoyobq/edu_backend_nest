import { Injectable } from '@nestjs/common';
import { ConsumeAiGenerateJobUsecase } from '@src/usecases/ai-worker/consume-ai-generate-job.usecase';
import {
  type AiGenerateJob,
  type AiGenerateResult,
  mapAiGenerateJobToCompleteInput,
  mapAiGenerateJobToFailInput,
  mapAiGenerateJobToProcessInput,
  mapMissingAiGenerateJobToFailInput,
} from './ai-generate.mapper';

@Injectable()
export class AiGenerateHandler {
  constructor(private readonly consumeAiGenerateJobUsecase: ConsumeAiGenerateJobUsecase) {}

  async process(input: { readonly job: AiGenerateJob }): Promise<AiGenerateResult> {
    return await this.consumeAiGenerateJobUsecase.process(
      mapAiGenerateJobToProcessInput({ job: input.job }),
    );
  }

  async onCompleted(input: { readonly job: AiGenerateJob }): Promise<void> {
    await this.consumeAiGenerateJobUsecase.complete(
      mapAiGenerateJobToCompleteInput({ job: input.job }),
    );
  }

  async onFailed(input: {
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
}
