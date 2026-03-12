import { ASYNC_TASK_RECORD_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import { Injectable } from '@nestjs/common';

export interface ListAsyncTaskRecordsByTraceIdInput {
  readonly traceId: string;
  readonly limit?: number;
}

export interface ListAsyncTaskRecordsByTraceIdResult {
  readonly items: ReadonlyArray<AsyncTaskRecordView>;
}

@Injectable()
export class ListAsyncTaskRecordsByTraceIdUsecase {
  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: ListAsyncTaskRecordsByTraceIdInput,
  ): Promise<ListAsyncTaskRecordsByTraceIdResult> {
    const traceId = this.normalizeRequiredField({
      value: input.traceId,
      fieldName: 'traceId',
    });
    const items = await this.asyncTaskRecordQueryService.listByTraceId({
      where: {
        traceId,
        limit: input.limit ?? 50,
      },
    });
    return { items };
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
