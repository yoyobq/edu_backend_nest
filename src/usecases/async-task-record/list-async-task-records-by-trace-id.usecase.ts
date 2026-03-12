import { ASYNC_TASK_RECORD_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import { Injectable } from '@nestjs/common';

export interface ListAsyncTaskRecordsByTraceIdInput {
  readonly traceId: string;
  readonly queueName?: string;
  readonly bizTypes?: ReadonlyArray<string>;
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
        queueName: this.normalizeOptionalField({ value: input.queueName }),
        bizTypes: this.normalizeOptionalStringList({ values: input.bizTypes }),
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

  private normalizeOptionalField(input: { readonly value?: string }): string | undefined {
    if (input.value === undefined) {
      return undefined;
    }
    const normalized = input.value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
    throw new DomainError(ASYNC_TASK_RECORD_ERROR.INVALID_PARAMS, '可选筛选项不能为空白');
  }

  private normalizeOptionalStringList(input: {
    readonly values?: ReadonlyArray<string>;
  }): ReadonlyArray<string> | undefined {
    if (input.values === undefined) {
      return undefined;
    }
    const normalized = input.values.map((item) => item.trim()).filter((item) => item.length > 0);
    if (normalized.length > 0) {
      return normalized;
    }
    throw new DomainError(ASYNC_TASK_RECORD_ERROR.INVALID_PARAMS, '可选筛选项不能为空白');
  }
}
