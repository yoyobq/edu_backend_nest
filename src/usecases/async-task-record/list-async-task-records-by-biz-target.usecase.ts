import { ASYNC_TASK_RECORD_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import type {
  AsyncTaskRecordStatus,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';
import { Injectable } from '@nestjs/common';

export interface ListAsyncTaskRecordsByBizTargetInput {
  readonly bizType: string;
  readonly bizKey: string;
  readonly bizSubKey?: string | null;
  readonly statuses?: ReadonlyArray<AsyncTaskRecordStatus>;
  readonly limit?: number;
}

export interface ListAsyncTaskRecordsByBizTargetResult {
  readonly items: ReadonlyArray<AsyncTaskRecordView>;
}

@Injectable()
export class ListAsyncTaskRecordsByBizTargetUsecase {
  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: ListAsyncTaskRecordsByBizTargetInput,
  ): Promise<ListAsyncTaskRecordsByBizTargetResult> {
    const bizType = this.normalizeRequiredField({
      value: input.bizType,
      fieldName: 'bizType',
    });
    const bizKey = this.normalizeRequiredField({
      value: input.bizKey,
      fieldName: 'bizKey',
    });
    const items = await this.asyncTaskRecordQueryService.listByBizTarget({
      where: {
        bizType,
        bizKey,
        bizSubKey: this.normalizeOptionalField({ value: input.bizSubKey }),
        statuses: input.statuses,
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

  private normalizeOptionalField(input: {
    readonly value?: string | null;
  }): string | null | undefined {
    if (input.value === undefined) {
      return undefined;
    }
    if (input.value === null) {
      return null;
    }
    const normalized = input.value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
