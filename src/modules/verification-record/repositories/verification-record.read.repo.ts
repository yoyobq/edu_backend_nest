// src/modules/verification-record/repositories/verification-record.read.repo.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { VerificationRecordStatus } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerificationRecordEntity } from '../verification-record.entity';

/**
 * 验证记录只读查询仓库
 * 专门负责查询操作，不涉及数据修改
 *
 * 职责范围：
 * - 根据 token 指纹查找活跃记录
 * - 上下文匹配校验（audience、email、phone）
 * - 只读查询优化
 */
@Injectable()
export class VerificationRecordReadRepository {
  constructor(
    @InjectRepository(VerificationRecordEntity)
    private readonly repository: Repository<VerificationRecordEntity>,
  ) {}

  /**
   * 根据 token 指纹查找活跃的验证记录
   *
   * @param tokenFp token 指纹（Buffer 格式）
   * @returns 活跃的验证记录或 null
   */
  async findActiveByTokenFp(tokenFp: Buffer): Promise<VerificationRecordEntity | null> {
    try {
      return await this.repository.findOne({
        where: {
          tokenFp,
          status: VerificationRecordStatus.ACTIVE,
        },
      });
    } catch (error) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.QUERY_FAILED,
        '查询活跃验证记录失败',
        {
          tokenFpLength: tokenFp.length,
          error: error instanceof Error ? error.message : '未知错误',
        },
        error,
      );
    }
  }

  /**
   * 确保验证记录与上下文匹配
   *
   * 校验规则：
   * - audience：如果提供，必须与记录中的 payload.audience 匹配
   * - email：如果提供，必须与记录中的 payload.email 匹配
   * - phone：如果提供，必须与记录中的 payload.phone 匹配
   *
   * @param record 验证记录实体
   * @param audience 客户端类型（可选）
   * @param email 邮箱地址（可选）
   * @param phone 手机号码（可选）
   * @throws DomainError 当上下文不匹配时抛出错误
   */
  ensureContextMatch(
    record: VerificationRecordEntity,
    audience?: AudienceTypeEnum | null,
    email?: string | null,
    phone?: string | null,
  ): void {
    const payload = record.payload;

    // 校验 audience
    if (audience && payload?.audience && payload.audience !== audience) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '客户端类型不匹配', {
        expected: audience,
        actual: payload.audience as string,
        recordId: record.id,
      });
    }

    // 校验 email
    if (email && payload?.email && payload.email !== email) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '邮箱地址不匹配', {
        expected: email,
        actual: payload.email as string,
        recordId: record.id,
      });
    }

    // 校验 phone
    if (phone && payload?.phone && payload.phone !== phone) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '手机号码不匹配', {
        expected: phone,
        actual: payload.phone as string,
        recordId: record.id,
      });
    }
  }
}
