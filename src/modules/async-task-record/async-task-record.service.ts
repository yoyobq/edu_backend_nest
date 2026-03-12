// src/modules/async-task-record/async-task-record.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AsyncTaskRecordEntity, AsyncTaskRecordStatus } from './async-task-record.entity';
import {
  AsyncTaskRecordView,
  CreateAsyncTaskRecordInput,
  FindAsyncTaskRecordByQueueJobInput,
  ListAsyncTaskRecordsByBizTargetInput,
  ListAsyncTaskRecordsByTraceInput,
  RecordAsyncTaskEnqueuedInput,
  RecordAsyncTaskEnqueueFailedInput,
  RecordAsyncTaskFinishedInput,
  RecordAsyncTaskStartedInput,
  UpdateAsyncTaskRecordStatusInput,
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

  async createRecord(input: {
    readonly data: CreateAsyncTaskRecordInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    const repository = this.getRepository(input.manager);
    const entity = repository.create({
      queueName: input.data.queueName,
      jobName: input.data.jobName,
      jobId: input.data.jobId,
      traceId: input.data.traceId,
      actorAccountId: input.data.actorAccountId ?? null,
      actorActiveRole: input.data.actorActiveRole ?? null,
      bizType: input.data.bizType,
      bizKey: input.data.bizKey,
      bizSubKey: input.data.bizSubKey ?? null,
      source: input.data.source,
      reason: input.data.reason ?? null,
      occurredAt: input.data.occurredAt ?? null,
      dedupKey: input.data.dedupKey ?? null,
      status: input.data.status,
      attemptCount: input.data.attemptCount ?? 0,
      maxAttempts: input.data.maxAttempts ?? null,
      enqueuedAt: input.data.enqueuedAt,
      startedAt: input.data.startedAt ?? null,
      finishedAt: input.data.finishedAt ?? null,
    });
    const saved = await repository.save(entity);
    return this.toView(saved);
  }

  async createRecordIfAbsent(input: {
    readonly data: CreateAsyncTaskRecordInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    try {
      return await this.createRecord(input);
    } catch (error: unknown) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }
      const existing = await this.findByQueueJob({
        where: {
          queueName: input.data.queueName,
          jobId: input.data.jobId,
        },
        manager: input.manager,
      });
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  async recordEnqueued(input: {
    readonly data: RecordAsyncTaskEnqueuedInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    const occurredAt = input.data.occurredAt ?? input.data.enqueuedAt ?? new Date();
    const enqueuedAt = input.data.enqueuedAt ?? occurredAt;
    return await this.createRecordIfAbsent({
      data: {
        queueName: input.data.queueName,
        jobName: input.data.jobName,
        jobId: input.data.jobId,
        traceId: input.data.traceId,
        actorAccountId: input.data.actorAccountId,
        actorActiveRole: input.data.actorActiveRole,
        bizType: input.data.bizType,
        bizKey: input.data.bizKey,
        bizSubKey: input.data.bizSubKey,
        source: input.data.source,
        reason: input.data.reason,
        occurredAt,
        dedupKey: input.data.dedupKey,
        status: 'queued',
        attemptCount: 0,
        maxAttempts: input.data.maxAttempts,
        enqueuedAt,
      },
      manager: input.manager,
    });
  }

  async recordEnqueueFailed(input: {
    readonly data: RecordAsyncTaskEnqueueFailedInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    const occurredAt = input.data.occurredAt ?? new Date();
    const resolvedJobId = this.resolveJobId({
      jobId: input.data.jobId,
      traceId: input.data.traceId,
      occurredAt,
    });
    const buildCreateData = (jobId: string): CreateAsyncTaskRecordInput => ({
      queueName: input.data.queueName,
      jobName: input.data.jobName,
      jobId,
      traceId: input.data.traceId,
      actorAccountId: input.data.actorAccountId,
      actorActiveRole: input.data.actorActiveRole,
      bizType: input.data.bizType,
      bizKey: input.data.bizKey,
      bizSubKey: input.data.bizSubKey,
      source: input.data.source,
      reason: input.data.reason ?? 'enqueue_failed',
      occurredAt,
      dedupKey: input.data.dedupKey,
      status: 'failed',
      attemptCount: 0,
      maxAttempts: input.data.maxAttempts,
      enqueuedAt: occurredAt,
      finishedAt: occurredAt,
    });
    try {
      return await this.createRecord({
        data: buildCreateData(resolvedJobId),
        manager: input.manager,
      });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }
      if (!input.data.jobId || resolvedJobId !== input.data.jobId.trim()) {
        throw error;
      }
      const fallbackJobId = this.resolveJobId({
        jobId: undefined,
        traceId: input.data.traceId,
        occurredAt,
      });
      return await this.createRecord({
        data: buildCreateData(fallbackJobId),
        manager: input.manager,
      });
    }
  }

  async recordStarted(input: {
    readonly data: RecordAsyncTaskStartedInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    const startedAt = input.data.startedAt ?? new Date();
    const occurredAt = input.data.occurredAt ?? startedAt;
    const existing = await this.findByQueueJob({
      where: { queueName: input.data.queueName, jobId: input.data.jobId },
      manager: input.manager,
    });
    const attemptCount = input.data.attemptCount ?? Math.max((existing?.attemptCount ?? 0) + 1, 1);

    if (existing) {
      const updated = await this.updateStatusByQueueJob({
        where: { queueName: input.data.queueName, jobId: input.data.jobId },
        patch: {
          status: 'processing',
          startedAt,
          occurredAt,
          attemptCount,
          reason: input.data.reason,
        },
        manager: input.manager,
      });
      if (updated) {
        return updated;
      }
    }

    return await this.createRecord({
      data: {
        queueName: input.data.queueName,
        jobName: input.data.jobName,
        jobId: input.data.jobId,
        traceId: input.data.traceId,
        actorAccountId: input.data.actorAccountId,
        actorActiveRole: input.data.actorActiveRole,
        bizType: input.data.bizType,
        bizKey: input.data.bizKey,
        bizSubKey: input.data.bizSubKey,
        source: input.data.source,
        reason: input.data.reason,
        occurredAt,
        dedupKey: input.data.dedupKey,
        status: 'processing',
        attemptCount,
        maxAttempts: input.data.maxAttempts,
        enqueuedAt: input.data.enqueuedAt ?? startedAt,
        startedAt,
      },
      manager: input.manager,
    });
  }

  async recordFinished(input: {
    readonly data: RecordAsyncTaskFinishedInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView> {
    const finishedAt = input.data.finishedAt ?? new Date();
    const occurredAt = input.data.occurredAt ?? finishedAt;
    const existing = await this.findByQueueJob({
      where: { queueName: input.data.queueName, jobId: input.data.jobId },
      manager: input.manager,
    });
    const attemptCount = input.data.attemptCount ?? existing?.attemptCount ?? 1;

    if (existing) {
      const updated = await this.updateStatusByQueueJob({
        where: { queueName: input.data.queueName, jobId: input.data.jobId },
        patch: {
          status: input.data.status,
          finishedAt,
          occurredAt,
          attemptCount,
          reason: input.data.reason,
        },
        manager: input.manager,
      });
      if (updated) {
        return updated;
      }
    }

    return await this.createRecord({
      data: {
        queueName: input.data.queueName,
        jobName: input.data.jobName,
        jobId: input.data.jobId,
        traceId: input.data.traceId,
        actorAccountId: input.data.actorAccountId,
        actorActiveRole: input.data.actorActiveRole,
        bizType: input.data.bizType,
        bizKey: input.data.bizKey,
        bizSubKey: input.data.bizSubKey,
        source: input.data.source,
        reason: input.data.reason,
        occurredAt,
        dedupKey: input.data.dedupKey,
        status: input.data.status,
        attemptCount,
        maxAttempts: input.data.maxAttempts,
        enqueuedAt: input.data.enqueuedAt ?? finishedAt,
        startedAt: input.data.startedAt ?? null,
        finishedAt,
      },
      manager: input.manager,
    });
  }

  async updateStatusByQueueJob(input: {
    readonly where: FindAsyncTaskRecordByQueueJobInput;
    readonly patch: UpdateAsyncTaskRecordStatusInput;
    readonly manager?: EntityManager;
  }): Promise<AsyncTaskRecordView | null> {
    const repository = this.getRepository(input.manager);
    const entity = await repository.findOne({ where: input.where });
    if (!entity) {
      return null;
    }
    if (input.patch.status !== undefined) {
      entity.status = input.patch.status;
    }
    if (input.patch.attemptCount !== undefined) {
      entity.attemptCount = input.patch.attemptCount;
    }
    if (input.patch.startedAt !== undefined) {
      entity.startedAt = input.patch.startedAt;
    }
    if (input.patch.finishedAt !== undefined) {
      entity.finishedAt = input.patch.finishedAt;
    }
    if (input.patch.reason !== undefined) {
      entity.reason = input.patch.reason;
    }
    if (input.patch.occurredAt !== undefined) {
      entity.occurredAt = input.patch.occurredAt;
    }
    const saved = await repository.save(entity);
    return this.toView(saved);
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

  private resolveJobId(input: {
    readonly jobId?: string;
    readonly traceId: string;
    readonly occurredAt: Date;
  }): string {
    const normalized = input.jobId?.trim();
    if (normalized) {
      return normalized;
    }
    return `enqueue-failed:${input.traceId}:${input.occurredAt.getTime()}`;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const errorObject = error as unknown as {
      readonly code?: string;
      readonly errno?: number;
      readonly sqlState?: string;
      readonly driverError?: {
        readonly code?: string;
        readonly errno?: number;
        readonly sqlState?: string;
      };
    };
    const driverCode = errorObject.driverError?.code;
    const driverErrno = errorObject.driverError?.errno;
    const driverSqlState = errorObject.driverError?.sqlState;
    if (
      driverCode === 'ER_DUP_ENTRY' ||
      driverErrno === 1062 ||
      driverSqlState === '23000' ||
      driverCode === '23505'
    ) {
      return true;
    }
    return (
      errorObject.code === 'ER_DUP_ENTRY' ||
      errorObject.errno === 1062 ||
      errorObject.sqlState === '23000' ||
      errorObject.code === '23505'
    );
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
