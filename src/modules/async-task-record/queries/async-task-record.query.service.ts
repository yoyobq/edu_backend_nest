// src/modules/async-task-record/queries/async-task-record.query.service.ts
import { Injectable } from '@nestjs/common';
import { AsyncTaskRecordStatus } from '../async-task-record.entity';
import { AsyncTaskRecordService } from '../async-task-record.service';
import {
  AsyncTaskRecordView,
  FindAsyncTaskRecordByQueueJobInput,
  ListAsyncTaskRecordsByBizTargetInput,
  ListAsyncTaskRecordsByTraceInput,
} from '../async-task-record.types';

@Injectable()
export class AsyncTaskRecordQueryService {
  constructor(private readonly asyncTaskRecordService: AsyncTaskRecordService) {}

  async findById(input: { readonly id: number }): Promise<AsyncTaskRecordView | null> {
    return await this.asyncTaskRecordService.findById({ id: input.id });
  }

  async findByQueueJob(input: {
    readonly where: FindAsyncTaskRecordByQueueJobInput;
  }): Promise<AsyncTaskRecordView | null> {
    return await this.asyncTaskRecordService.findByQueueJob({ where: input.where });
  }

  async listByTraceId(input: {
    readonly where: ListAsyncTaskRecordsByTraceInput;
  }): Promise<AsyncTaskRecordView[]> {
    return await this.asyncTaskRecordService.listByTraceId({ where: input.where });
  }

  async listByBizTarget(input: {
    readonly where: ListAsyncTaskRecordsByBizTargetInput;
  }): Promise<AsyncTaskRecordView[]> {
    return await this.asyncTaskRecordService.listByBizTarget({ where: input.where });
  }

  async countByStatus(input: {
    readonly statuses: ReadonlyArray<AsyncTaskRecordStatus>;
  }): Promise<number> {
    return await this.asyncTaskRecordService.countByStatus({ statuses: input.statuses });
  }

  async hasActiveTaskByBizTarget(input: {
    readonly bizType: string;
    readonly bizKey: string;
    readonly bizSubKey?: string | null;
  }): Promise<boolean> {
    const records = await this.asyncTaskRecordService.listByBizTarget({
      where: {
        bizType: input.bizType,
        bizKey: input.bizKey,
        bizSubKey: input.bizSubKey,
        statuses: ['queued', 'processing'],
        limit: 1,
      },
    });
    return records.length > 0;
  }
}
