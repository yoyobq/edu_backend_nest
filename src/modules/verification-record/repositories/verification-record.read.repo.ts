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
   * 校验规则（严格匹配）：
   * - audience：如果调用方提供，记录必须有对应字段且值匹配
   * - email：如果调用方提供，记录必须有对应字段且值匹配（标准化后比较）
   * - phone：如果调用方提供，记录必须有对应字段且值匹配（标准化后比较）
   * - 记录缺字段或值不匹配均视为校验失败
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

    // 校验 audience（严格匹配）
    if (audience) {
      const recordAudience = payload?.audience;
      if (!recordAudience || recordAudience !== audience) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '客户端类型不匹配', {
          expected: audience,
          actual: recordAudience || null,
          recordId: record.id,
          field: 'audience',
        });
      }
    }

    // 校验 email（严格匹配 + 标准化）
    if (email) {
      const recordEmail = payload?.email;
      if (!recordEmail) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH,
          '邮箱地址不匹配：记录缺少邮箱字段',
          {
            expected: email,
            actual: null,
            recordId: record.id,
            field: 'email',
          },
        );
      }

      // 轻量标准化：转小写 + 去空格
      const normalizedExpected = this.normalizeEmail(email);
      const normalizedActual = this.normalizeEmail(recordEmail as string);

      if (normalizedActual !== normalizedExpected) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '邮箱地址不匹配', {
          expected: normalizedExpected,
          actual: normalizedActual,
          recordId: record.id,
          field: 'email',
        });
      }
    }

    // 校验 phone（严格匹配 + 标准化）
    if (phone) {
      const recordPhone = payload?.phone;
      if (!recordPhone) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH,
          '手机号码不匹配：记录缺少手机号字段',
          {
            expected: phone,
            actual: null,
            recordId: record.id,
            field: 'phone',
          },
        );
      }

      // 轻量标准化：去除非数字字符
      const normalizedExpected = this.normalizePhone(phone);
      const normalizedActual = this.normalizePhone(recordPhone as string);

      if (normalizedActual !== normalizedExpected) {
        throw new DomainError(VERIFICATION_RECORD_ERROR.CONTEXT_MISMATCH, '手机号码不匹配', {
          expected: normalizedExpected,
          actual: normalizedActual,
          recordId: record.id,
          field: 'phone',
        });
      }
    }
  }

  /**
   * 邮箱轻量标准化
   * @param email 原始邮箱
   * @returns 标准化后的邮箱
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * 手机号轻量标准化
   * @param phone 原始手机号
   * @returns 标准化后的手机号（仅保留数字）
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
