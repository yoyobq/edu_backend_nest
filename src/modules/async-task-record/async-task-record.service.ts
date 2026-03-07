import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { AsyncTaskRecordEntity, AsyncTaskRecordStatus } from './async-task-record.entity';
import {
  AsyncTaskRecordView,
  FindAsyncTaskRecordByQueueJobInput,
  ListAsyncTaskRecordsByBizTargetInput,
  ListAsyncTaskRecordsByTraceInput,
} from './async-task-record.types';

export type AsyncTaskRecordTransactionManager = EntityManager;

@Injectable()
export class AsyncTaskRecordService {
  constructor(
    @InjectRepository(AsyncTaskRecordEntity)
    private readonly asyncTaskRecordRepository: Repository<AsyncTaskRecordEntity>,
  ) {}

  async findById(input: {
    readonly id: number;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView | null> {
    const repository = this.getRepository(input.manager);
    const entity = await repository.findOne({ where: { id: input.id } });
    return entity ? this.toView(entity) : null;
  }

  async findByQueueJob(input: {
    readonly where: FindAsyncTaskRecordByQueueJobInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView | null> {
    const repository = this.getRepository(input.manager);
    const entity = await repository.findOne({ where: input.where });
    return entity ? this.toView(entity) : null;
  }

  async listByTraceId(input: {
    readonly where: ListAsyncTaskRecordsByTraceInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView[]> {
    const repository = this.getRepository(input.manager);
    const limit = this.normalizeLimit(input.where.limit);
    const entities = await repository.find({
      where: { traceId: input.where.traceId },
      order: { id: 'DESC' },
      take: limit,
    });
    return entities.map((entity) => this.toView(entity));
  }

  async listByBizTarget(input: {
    readonly where: ListAsyncTaskRecordsByBizTargetInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView[]> {
    const repository = this.getRepository(input.manager);
    const limit = this.normalizeLimit(input.where.limit);
    const where: FindOptionsWhere<AsyncTaskRecordEntity> = {
      bizType: input.where.bizType,
      bizKey: input.where.bizKey,
    };

    if (input.where.bizSubKey !== undefined) {
      where.bizSubKey = input.where.bizSubKey === null ? IsNull() : input.where.bizSubKey;
    }

    if (input.where.statuses && input.where.statuses.length > 0) {
      where.status = In(input.where.statuses as AsyncTaskRecordStatus[]);
    }

    const entities = await repository.find({
      where,
      order: { id: 'DESC' },
      take: limit,
    });
    return entities.map((entity) => this.toView(entity));
  }

  async countByStatus(input: {
    readonly statuses: ReadonlyArray<AsyncTaskRecordStatus>;
    readonly manager?: EntityManager;
  }): Promise<number> {
    const repository = this.getRepository(input.manager);
    if (input.statuses.length === 0) {
      return 0;
    }
    return await repository.count({ where: { status: In([...input.statuses]) } });
  }

  async runTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return await this.asyncTaskRecordRepository.manager.transaction(callback);
  }

  getRepository(manager?: EntityManager): Repository<AsyncTaskRecordEntity> {
    return manager ? manager.getRepository(AsyncTaskRecordEntity) : this.asyncTaskRecordRepository;
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || limit < 1) {
      return 50;
    }
    return Math.min(limit, 500);
  }

  private toView(entity: AsyncTaskRecordEntity): AsyncTaskRecordView {
    return {
      id: entity.id,
      queueName: entity.queueName,
      jobName: entity.jobName,
      jobId: entity.jobId,
      traceId: entity.traceId,
      actorAccountId: entity.actorAccountId,
      actorActiveRole: entity.actorActiveRole,
      bizType: entity.bizType,
      bizKey: entity.bizKey,
      bizSubKey: entity.bizSubKey,
      source: entity.source,
      reason: entity.reason,
      occurredAt: entity.occurredAt,
      dedupKey: entity.dedupKey,
      status: entity.status,
      attemptCount: entity.attemptCount,
      maxAttempts: entity.maxAttempts,
      enqueuedAt: entity.enqueuedAt,
      startedAt: entity.startedAt,
      finishedAt: entity.finishedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
