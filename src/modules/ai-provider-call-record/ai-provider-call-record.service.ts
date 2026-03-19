import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import {
  AiProviderCallRecordEntity,
  type AiProviderCallRecordProviderStatus,
  type AiProviderCallRecordSource,
} from './ai-provider-call-record.entity';

export interface CreateAiProviderCallRecordInput {
  readonly asyncTaskRecordId?: number | null;
  readonly traceId: string;
  readonly accountId?: number | null;
  readonly nicknameSnapshot?: string | null;
  readonly bizType?: string | null;
  readonly bizKey?: string | null;
  readonly bizSubKey?: string | null;
  readonly source: AiProviderCallRecordSource;
  readonly provider: string;
  readonly model: string;
  readonly taskType: string;
  readonly providerRequestId?: string | null;
  readonly providerStatus: AiProviderCallRecordProviderStatus;
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
  readonly providerLatencyMs?: number | null;
}

export interface UpdateAiProviderCallRecordPatch {
  readonly providerRequestId?: string | null;
  readonly providerStatus?: AiProviderCallRecordProviderStatus;
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
  readonly providerLatencyMs?: number | null;
}

export interface AiProviderCallRecordView {
  readonly id: number;
  readonly asyncTaskRecordId: number | null;
  readonly traceId: string;
  readonly callSeq: number;
  readonly accountId: number | null;
  readonly nicknameSnapshot: string | null;
  readonly bizType: string | null;
  readonly bizKey: string | null;
  readonly bizSubKey: string | null;
  readonly source: AiProviderCallRecordSource;
  readonly provider: string;
  readonly model: string;
  readonly taskType: string;
  readonly providerRequestId: string | null;
  readonly providerStatus: AiProviderCallRecordProviderStatus;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
  readonly normalizedErrorCode: string | null;
  readonly providerErrorCode: string | null;
  readonly errorMessage: string | null;
  readonly providerStartedAt: Date | null;
  readonly providerFinishedAt: Date | null;
  readonly providerLatencyMs: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@Injectable()
export class AiProviderCallRecordService {
  constructor(
    @InjectRepository(AiProviderCallRecordEntity)
    private readonly aiProviderCallRecordRepository: Repository<AiProviderCallRecordEntity>,
  ) {}

  async createRecord(input: {
    readonly data: CreateAiProviderCallRecordInput;
    readonly manager?: EntityManager;
  }): Promise<AiProviderCallRecordView> {
    const repository = this.resolveRepository(input.manager);
    const callSeq = await this.allocateCallSeq({
      traceId: input.data.traceId,
      manager: input.manager,
    });
    const entity = repository.create({
      asyncTaskRecordId: input.data.asyncTaskRecordId ?? null,
      traceId: input.data.traceId,
      callSeq,
      accountId: input.data.accountId ?? null,
      nicknameSnapshot: input.data.nicknameSnapshot ?? null,
      bizType: input.data.bizType ?? null,
      bizKey: input.data.bizKey ?? null,
      bizSubKey: input.data.bizSubKey ?? null,
      source: input.data.source,
      provider: input.data.provider,
      model: input.data.model,
      taskType: input.data.taskType,
      providerRequestId: input.data.providerRequestId ?? null,
      providerStatus: input.data.providerStatus,
      promptTokens: input.data.promptTokens ?? null,
      completionTokens: input.data.completionTokens ?? null,
      totalTokens: input.data.totalTokens ?? null,
      costAmount: input.data.costAmount ?? null,
      costCurrency: input.data.costCurrency ?? null,
      normalizedErrorCode: input.data.normalizedErrorCode ?? null,
      providerErrorCode: input.data.providerErrorCode ?? null,
      errorMessage: input.data.errorMessage ?? null,
      providerStartedAt: input.data.providerStartedAt ?? null,
      providerFinishedAt: input.data.providerFinishedAt ?? null,
      providerLatencyMs: input.data.providerLatencyMs ?? null,
    });
    const saved = await repository.save(entity);
    return this.toView(saved);
  }

  async updateRecordById(input: {
    readonly where: { readonly id: number };
    readonly patch: UpdateAiProviderCallRecordPatch;
    readonly manager?: EntityManager;
  }): Promise<AiProviderCallRecordView | null> {
    const repository = this.resolveRepository(input.manager);
    const record = await repository.findOne({ where: { id: input.where.id } });
    if (!record) {
      return null;
    }
    repository.merge(record, input.patch);
    const saved = await repository.save(record);
    return this.toView(saved);
  }

  private resolveRepository(manager?: EntityManager): Repository<AiProviderCallRecordEntity> {
    if (manager) {
      return manager.getRepository(AiProviderCallRecordEntity);
    }
    return this.aiProviderCallRecordRepository;
  }

  private async allocateCallSeq(input: {
    readonly traceId: string;
    readonly manager?: EntityManager;
  }): Promise<number> {
    const repository = this.resolveRepository(input.manager);
    const row = await repository
      .createQueryBuilder('record')
      .select('record.callSeq', 'callSeq')
      .where('record.traceId = :traceId', { traceId: input.traceId })
      .orderBy('record.callSeq', 'DESC')
      .limit(1)
      .getRawOne<{ readonly callSeq?: number | string }>();
    const maxCallSeq = row?.callSeq === undefined ? 0 : Number(row.callSeq);
    if (!Number.isFinite(maxCallSeq) || maxCallSeq < 0) {
      return 1;
    }
    return maxCallSeq + 1;
  }

  private toView(entity: AiProviderCallRecordEntity): AiProviderCallRecordView {
    return {
      id: entity.id,
      asyncTaskRecordId: entity.asyncTaskRecordId,
      traceId: entity.traceId,
      callSeq: entity.callSeq,
      accountId: entity.accountId,
      nicknameSnapshot: entity.nicknameSnapshot,
      bizType: entity.bizType,
      bizKey: entity.bizKey,
      bizSubKey: entity.bizSubKey,
      source: entity.source,
      provider: entity.provider,
      model: entity.model,
      taskType: entity.taskType,
      providerRequestId: entity.providerRequestId,
      providerStatus: entity.providerStatus,
      promptTokens: entity.promptTokens,
      completionTokens: entity.completionTokens,
      totalTokens: entity.totalTokens,
      costAmount: entity.costAmount,
      costCurrency: entity.costCurrency,
      normalizedErrorCode: entity.normalizedErrorCode,
      providerErrorCode: entity.providerErrorCode,
      errorMessage: entity.errorMessage,
      providerStartedAt: entity.providerStartedAt,
      providerFinishedAt: entity.providerFinishedAt,
      providerLatencyMs: entity.providerLatencyMs,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
