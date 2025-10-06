// src/usecases/verification-record/consume-verification-record.usecase.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import {
  DomainError,
  PERMISSION_ERROR,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';
import { EntityManager, Repository, UpdateQueryBuilder } from 'typeorm';

/**
 * 通过 token 消费验证记录用例参数
 */
export interface ConsumeByTokenUsecaseParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 主体类型（可选，用于记录消费后的主体信息） */
  subjectType?: SubjectType;
  /** 主体 ID（可选，用于记录消费后的主体信息） */
  subjectId?: number;
  /** 可选的事务管理器 */
  manager?: EntityManager;
}

/**
 * 通过 ID 消费验证记录用例参数
 */
export interface ConsumeByIdUsecaseParams {
  /** 记录 ID */
  recordId: number;
  /** 消费者账号 ID（可选，某些类型允许匿名消费） */
  consumedByAccountId?: number;
  /** 期望的验证记录类型（可选但强烈建议提供） */
  expectedType?: VerificationRecordType;
  /** 主体类型（可选，用于记录消费后的主体信息） */
  subjectType?: SubjectType;
  /** 主体 ID（可选，用于记录消费后的主体信息） */
  subjectId?: number;
  /** 可选的事务管理器 */
  manager?: EntityManager;
}

/**
 * 撤销验证记录用例参数
 */
export interface RevokeRecordUsecaseParams {
  /** 记录 ID */
  recordId: number;
  /** 可选的事务管理器 */
  manager?: EntityManager;
}

/**
 * 验证失败原因检查器
 */
interface FailureChecker {
  check: (record: VerificationRecordEntity, context: ValidationContext) => DomainError | null;
  priority: number;
}

/**
 * 验证上下文
 */
interface ValidationContext {
  expectedType?: VerificationRecordType;
  consumedByAccountId?: number;
  subjectType?: SubjectType;
  subjectId?: number;
  now: Date;
}

/**
 * 消费验证记录用例
 * 负责验证记录的消费操作，包括正常消费和撤销消费
 */
@Injectable()
export class ConsumeVerificationRecordUsecase {
  /**
   * 验证失败检查器列表，按优先级排序
   */
  private readonly failureCheckers: FailureChecker[] = [
    {
      priority: 1,
      check: (record, context) =>
        context.expectedType && record.type !== context.expectedType
          ? new DomainError(VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID, '验证码类型不匹配')
          : null,
    },
    {
      priority: 2,
      check: (record, context) => {
        // PASSWORD_RESET 类型允许匿名消费，即使有 targetAccountId 限制
        if (record.type === VerificationRecordType.PASSWORD_RESET) {
          return null;
        }

        // 如果记录有 targetAccountId 限制，但消费者未提供账号 ID，则拒绝
        if (record.targetAccountId && !context.consumedByAccountId) {
          return new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '此验证码需要登录后使用');
        }
        // 如果记录有 targetAccountId 限制，且消费者账号不匹配，则拒绝
        if (
          record.targetAccountId &&
          context.consumedByAccountId &&
          record.targetAccountId !== context.consumedByAccountId
        ) {
          return new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '您无权使用此验证码', {
            targetAccountId: record.targetAccountId,
            consumedByAccountId: context.consumedByAccountId,
          });
        }
        return null;
      },
    },
    {
      priority: 3,
      check: (record) =>
        record.status !== VerificationRecordStatus.ACTIVE
          ? new DomainError(
              VERIFICATION_RECORD_ERROR.RECORD_ALREADY_CONSUMED,
              '验证码已被使用或已失效',
            )
          : null,
    },
    {
      priority: 4,
      check: (record, context) => {
        // 检查是否已过期（包含 180 秒宽限期）
        const gracePeriodMs = 180 * 1000; // 180 秒宽限期
        const expiresAtWithGracePeriod = new Date(record.expiresAt.getTime() + gracePeriodMs);

        return expiresAtWithGracePeriod <= context.now
          ? new DomainError(VERIFICATION_RECORD_ERROR.RECORD_EXPIRED, '验证码已过期，请重新获取')
          : null;
      },
    },
    {
      priority: 5,
      check: (record, context) =>
        record.notBefore && record.notBefore > context.now
          ? new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_ACTIVE_YET, '验证码尚未到使用时间')
          : null,
    },
  ];

  constructor(private readonly verificationRecordService: VerificationRecordService) {}

  /**
   * 通过 token 消费验证记录
   * @param params 消费参数
   * @returns 更新后的验证记录实体
   */
  async consumeByToken(params: ConsumeByTokenUsecaseParams): Promise<VerificationRecordEntity> {
    const { token, consumedByAccountId, expectedType, subjectType, subjectId, manager } = params;
    const tokenFp = this.verificationRecordService.generateTokenFingerprint(token);

    return this.executeConsumption({
      repository: this.getRepository(manager),
      whereCondition: { tokenFp },
      whereClause: (qb) => qb.andWhere('tokenFp = :tokenFp', { tokenFp }),
      notFoundError: VERIFICATION_RECORD_ERROR.INVALID_TOKEN,
      notFoundMessage: '无效的验证 token',
      context: { consumedByAccountId, expectedType, subjectType, subjectId, now: new Date() },
      errorDetails: { consumedByAccountId, expectedType },
    });
  }

  /**
   * 通过记录 ID 消费验证记录
   * @param params 消费参数
   * @returns 更新后的验证记录实体
   */
  async consumeById(params: ConsumeByIdUsecaseParams): Promise<VerificationRecordEntity> {
    const { recordId, consumedByAccountId, expectedType, subjectType, subjectId, manager } = params;

    return this.executeConsumption({
      repository: this.getRepository(manager),
      whereCondition: { id: recordId },
      whereClause: (qb) => qb.andWhere('id = :recordId', { recordId }),
      notFoundError: VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND,
      notFoundMessage: '验证记录不存在或已失效',
      context: { consumedByAccountId, expectedType, subjectType, subjectId, now: new Date() },
      errorDetails: { recordId, consumedByAccountId, expectedType },
    });
  }

  /**
   * 在事务中通过 token 消费验证记录
   * @param token 验证 token
   * @param consumedByAccountId 消费者账号 ID（可选）
   * @param expectedType 期望的验证记录类型（可选但强烈建议提供）
   * @returns 更新后的验证记录实体
   */
  async consumeByTokenInTransaction(
    token: string,
    consumedByAccountId?: number,
    expectedType?: VerificationRecordType,
  ): Promise<VerificationRecordEntity> {
    return this.verificationRecordService.runTransaction(async (manager) => {
      return this.consumeByToken({ token, consumedByAccountId, expectedType, manager });
    });
  }

  /**
   * 在事务中通过 ID 消费验证记录
   * @param recordId 记录 ID
   * @param consumedByAccountId 消费者账号 ID（可选）
   * @returns 更新后的验证记录实体
   */
  async consumeByIdInTransaction(
    recordId: number,
    consumedByAccountId?: number,
  ): Promise<VerificationRecordEntity> {
    return this.verificationRecordService.runTransaction(async (manager) => {
      return this.consumeById({ recordId, consumedByAccountId, manager });
    });
  }

  /**
   * 撤销验证记录
   * @param params 撤销参数
   * @returns 更新后的验证记录实体
   */
  async revokeRecord(params: RevokeRecordUsecaseParams): Promise<VerificationRecordEntity> {
    const { recordId, manager } = params;

    return this.verificationRecordService.runTransaction(async (transactionManager) => {
      const activeManager = manager || transactionManager;
      const repository = this.verificationRecordService.getRepository(activeManager);

      try {
        // 使用 CAS 模式：原子性更新，只有状态为 ACTIVE 的记录才能被撤销
        const result = await repository
          .createQueryBuilder()
          .update(VerificationRecordEntity)
          .set({ status: VerificationRecordStatus.REVOKED })
          .where('id = :recordId', { recordId })
          .andWhere('status = :activeStatus', { activeStatus: VerificationRecordStatus.ACTIVE })
          .execute();

        if (result.affected === 0) {
          const record = await repository.findOne({ where: { id: recordId } });

          if (!record) {
            throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
          }

          throw new DomainError(
            VERIFICATION_RECORD_ERROR.STATUS_NOT_ALLOWED,
            '验证记录状态不允许撤销操作',
            { recordId, currentStatus: record.status },
          );
        }

        const updatedRecord = await repository.findOne({ where: { id: recordId } });
        if (!updatedRecord) {
          throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
        }

        return updatedRecord;
      } catch (error) {
        if (error instanceof DomainError) {
          throw error;
        }

        throw new DomainError(
          VERIFICATION_RECORD_ERROR.REVOCATION_FAILED,
          '撤销验证记录失败',
          { recordId, error: error instanceof Error ? error.message : '未知错误' },
          error,
        );
      }
    });
  }

  /**
   * 在事务中撤销验证记录
   * @param recordId 记录 ID
   * @returns 更新后的验证记录实体
   */
  async revokeRecordInTransaction(recordId: number): Promise<VerificationRecordEntity> {
    return this.revokeRecord({ recordId });
  }

  /**
   * 获取仓库实例
   */
  private getRepository(manager?: EntityManager): Repository<VerificationRecordEntity> {
    return manager
      ? this.verificationRecordService.getRepository(manager)
      : this.verificationRecordService.getRepository();
  }

  /**
   * 执行消费操作的通用方法
   */
  private async executeConsumption(options: {
    repository: Repository<VerificationRecordEntity>;
    whereCondition: Record<string, unknown>;
    whereClause: (
      qb: UpdateQueryBuilder<VerificationRecordEntity>,
    ) => UpdateQueryBuilder<VerificationRecordEntity>;
    notFoundError: string;
    notFoundMessage: string;
    context: ValidationContext;
    errorDetails: Record<string, unknown>;
  }): Promise<VerificationRecordEntity> {
    const {
      repository,
      whereCondition,
      whereClause,
      notFoundError,
      notFoundMessage,
      context,
      errorDetails,
    } = options;

    try {
      // 构建并执行原子更新操作
      const queryBuilder = this.buildUpdateQuery(repository, context);
      whereClause(queryBuilder);

      const updateResult = await queryBuilder.execute();

      if (updateResult.affected === 0) {
        const record = await repository.findOne({ where: whereCondition });
        this.handleUpdateFailure(record, context, notFoundError, notFoundMessage);
      }

      // 返回更新后的记录
      const updatedRecord = await repository.findOne({ where: whereCondition });
      if (!updatedRecord) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在');
      }

      return updatedRecord;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED,
        '消费验证记录失败',
        {
          ...errorDetails,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  /**
   * 构建更新查询
   */
  private buildUpdateQuery(
    repository: Repository<VerificationRecordEntity>,
    context: ValidationContext,
  ): UpdateQueryBuilder<VerificationRecordEntity> {
    const { consumedByAccountId, expectedType, subjectType, subjectId, now } = context;

    // 基础更新字段
    const updateFields: Record<string, unknown> = {
      status: VerificationRecordStatus.CONSUMED,
      consumedAt: now,
    };

    // 仅在提供 consumedByAccountId 时才设置该字段
    if (consumedByAccountId !== undefined) {
      updateFields.consumedByAccountId = consumedByAccountId;
    }

    // 设置主体信息字段
    if (subjectType !== undefined) {
      updateFields.subjectType = subjectType;
    }
    if (subjectId !== undefined) {
      updateFields.subjectId = subjectId;
    }

    // 计算包含 180 秒宽限期的过期时间
    const gracePeriodMs = 180 * 1000; // 180 秒宽限期
    const gracePeriodAgo = new Date(now.getTime() - gracePeriodMs);

    const queryBuilder = repository
      .createQueryBuilder()
      .update(VerificationRecordEntity)
      .set(updateFields)
      .andWhere('status = :activeStatus', { activeStatus: VerificationRecordStatus.ACTIVE })
      .andWhere('expiresAt > :gracePeriodAgo', { gracePeriodAgo })
      .andWhere('(notBefore IS NULL OR notBefore <= :now)', { now });

    // 权限检查：如果记录有 targetAccountId 限制
    if (consumedByAccountId !== undefined) {
      // 如果提供了消费者账号，检查权限匹配
      queryBuilder.andWhere('(targetAccountId IS NULL OR targetAccountId = :consumedByAccountId)', {
        consumedByAccountId,
      });
    } else {
      // 如果未提供消费者账号，只允许消费没有 targetAccountId 限制的记录
      // 特殊情况：PASSWORD_RESET 类型允许匿名消费，即使有 targetAccountId
      if (expectedType === VerificationRecordType.PASSWORD_RESET) {
        // PASSWORD_RESET 类型允许匿名消费，不需要额外的权限检查
      } else if (expectedType === VerificationRecordType.INVITE_COACH) {
        // INVITE_COACH 类型不允许匿名消费
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
          'Coach 邀请需要指定消费者账户 ID',
        );
      } else if (expectedType === VerificationRecordType.INVITE_MANAGER) {
        // INVITE_MANAGER 类型不允许匿名消费
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID,
          'Manager 邀请需要指定消费者账户 ID',
        );
      } else {
        // 对于其他类型，仅允许消费无 targetAccountId 限制的记录
        queryBuilder.andWhere('targetAccountId IS NULL');
      }
    }

    // 类型检查
    if (expectedType) {
      queryBuilder.andWhere('type = :expectedType', { expectedType });
    }

    return queryBuilder;
  }

  /**
   * 处理更新失败的情况
   */
  private handleUpdateFailure(
    record: VerificationRecordEntity | null,
    context: ValidationContext,
    notFoundError: string,
    notFoundMessage: string,
  ): never {
    if (!record) {
      throw new DomainError(notFoundError, notFoundMessage);
    }

    // 按优先级检查失败原因
    for (const checker of this.failureCheckers) {
      const error = checker.check(record, context);
      if (error) {
        throw error;
      }
    }

    // 如果所有检查都通过，说明是未知错误
    throw new DomainError(VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED, '验证码已被使用或已失效');
  }
}
