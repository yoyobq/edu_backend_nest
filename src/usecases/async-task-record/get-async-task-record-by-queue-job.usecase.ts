import { normalizeRequiredText } from '@src/core/common/input-normalize/input-normalize.policy';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import { Injectable } from '@nestjs/common';

export interface GetAsyncTaskRecordByQueueJobInput {
  readonly queueName: string;
  readonly jobId: string;
}

export type GetAsyncTaskRecordByQueueJobResult = AsyncTaskRecordView | null;

@Injectable()
export class GetAsyncTaskRecordByQueueJobUsecase {
  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: GetAsyncTaskRecordByQueueJobInput,
  ): Promise<GetAsyncTaskRecordByQueueJobResult> {
    const queueName = normalizeRequiredText(input.queueName, { fieldName: 'queueName' });
    const jobId = normalizeRequiredText(input.jobId, { fieldName: 'jobId' });

    return await this.asyncTaskRecordQueryService.findByQueueJob({
      where: {
        queueName,
        jobId,
      },
    });
  }
}
