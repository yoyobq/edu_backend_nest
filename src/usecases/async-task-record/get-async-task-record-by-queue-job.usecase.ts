import { ASYNC_TASK_RECORD_ERROR, DomainError } from '@src/core/common/errors/domain-error';
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
    const queueName = this.normalizeRequiredField({
      value: input.queueName,
      fieldName: 'queueName',
    });
    const jobId = this.normalizeRequiredField({
      value: input.jobId,
      fieldName: 'jobId',
    });

    return await this.asyncTaskRecordQueryService.findByQueueJob({
      where: {
        queueName,
        jobId,
      },
    });
  }

  private normalizeRequiredField(input: {
    readonly value: string;
    readonly fieldName: string;
  }): string {
    const normalized = input.value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
    throw new DomainError(ASYNC_TASK_RECORD_ERROR.INVALID_PARAMS, `${input.fieldName} 不能为空`);
  }
}
