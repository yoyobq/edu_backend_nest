// src/usecases/verification-record/find-verification-record.usecase.ts

import {
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';

/**
 * 查找验证记录用例参数
 */
export interface FindVerificationRecordUsecaseParams {
  /** 验证 token */
  token: string;
  /** 消费者账号 ID，用于权限校验（可选，公开验证时可为 undefined） */
  forAccountId?: number;
  /** 期望的验证记录类型（可选） */
  expectedType?: VerificationRecordType;
  /** 是否忽略 target 限制（用于公开验证） */
  ignoreTargetRestriction?: boolean;
}

/**
 * 查找验证记录用例
 * 专门负责查找可消费的活跃验证记录，包含完整的业务逻辑校验
 */
@Injectable()
export class FindVerificationRecordUsecase {
  constructor(private readonly verificationRecordService: VerificationRecordService) {}

  /**
   * 根据 token 查找可消费的活跃验证记录
   * 内置完整的状态、时效和权限校验
   * @param params 查找参数
   * @returns 可消费的验证记录实体或 null
   */
  async findActiveConsumableByToken(
    params: FindVerificationRecordUsecaseParams,
  ): Promise<VerificationRecordEntity | null> {
    try {
      const now = new Date();
      const { token, forAccountId, expectedType, ignoreTargetRestriction } = params;
      const tokenFp = this.verificationRecordService.generateTokenFingerprint(token);

      const repository = this.verificationRecordService.getRepository();
      const queryBuilder = repository
        .createQueryBuilder('record')
        .where('record.tokenFp = :tokenFp', { tokenFp })
        .andWhere('record.status = :activeStatus', {
          activeStatus: VerificationRecordStatus.ACTIVE,
        })
        .andWhere('record.expiresAt > :now', { now })
        .andWhere('(record.notBefore IS NULL OR record.notBefore <= :now)', { now });

      // Target 约束逻辑：默认严格，避免"缺省放宽"的安全风险
      if (ignoreTargetRestriction === true) {
        // 显式忽略 target 限制，不添加任何过滤
      } else if (forAccountId !== undefined) {
        // 有具体的账号 ID，允许查询无限制记录或该账号的记录
        queryBuilder.andWhere(
          '(record.targetAccountId IS NULL OR record.targetAccountId = :forAccountId)',
          {
            forAccountId,
          },
        );
      } else {
        // 公开验证但未显式忽略 target 限制
        // 对于 PASSWORD_RESET 类型，允许匿名访问（因为用户通过邮件链接访问，此时通常未登录）
        // 对于其他类型，仅允许无目标限制的记录
        if (expectedType === VerificationRecordType.PASSWORD_RESET) {
          // PASSWORD_RESET 类型允许匿名访问，不添加 targetAccountId 限制
        } else {
          // 其他类型仅允许无目标限制的记录
          queryBuilder.andWhere('record.targetAccountId IS NULL');
        }
      }

      // 如果指定了期望类型，添加类型过滤
      if (expectedType) {
        queryBuilder.andWhere('record.type = :expectedType', { expectedType });
      }

      const record = await queryBuilder.getOne();

      return record;
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询可消费验证记录失败',
        {
          forAccountId: params.forAccountId,
          expectedType: params.expectedType,
          ignoreTargetRestriction: params.ignoreTargetRestriction,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  /**
   * 根据记录 ID 查找可消费的活跃验证记录
   * 内置完整的状态、时效和权限校验
   * @param recordId 记录 ID
   * @param forAccountId 消费者账号 ID
   * @returns 可消费的验证记录实体或 null
   */
  async findActiveConsumableById(
    recordId: number,
    forAccountId: number,
  ): Promise<VerificationRecordEntity | null> {
    try {
      const now = new Date();

      const repository = this.verificationRecordService.getRepository();
      const record = await repository
        .createQueryBuilder('record')
        .where('record.id = :recordId', { recordId })
        .andWhere('record.status = :activeStatus', {
          activeStatus: VerificationRecordStatus.ACTIVE,
        })
        .andWhere('record.expiresAt > :now', { now })
        .andWhere('(record.notBefore IS NULL OR record.notBefore <= :now)', { now })
        .andWhere('(record.targetAccountId IS NULL OR record.targetAccountId = :forAccountId)', {
          forAccountId,
        })
        .getOne();

      return record;
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询可消费验证记录失败',
        {
          recordId,
          forAccountId,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }
}
