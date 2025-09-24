// src/usecases/verification-record/find-verification-record.usecase.ts

import { VerificationRecordStatus } from '@app-types/models/verification-record.types';
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
  /** 消费者账号 ID，用于权限校验 */
  forAccountId: number;
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
      const { token, forAccountId } = params;
      const tokenFp = this.verificationRecordService.generateTokenFingerprint(token);

      const repository = this.verificationRecordService.getRepository();
      const record = await repository
        .createQueryBuilder('record')
        .where('record.tokenFp = :tokenFp', { tokenFp })
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
          forAccountId: params.forAccountId,
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
