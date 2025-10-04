// src/modules/verification-record/services/verification-read.service.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { VerificationRecordStatus } from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { TokenFingerprintHelper } from '@core/security/token-fingerprint.helper';
import { Injectable } from '@nestjs/common';
import { VerificationRecordReadRepository } from '../repositories/verification-record.read.repo';
import { VerificationRecordEntity } from '../verification-record.entity';

/**
 * 验证记录聚合读取服务
 * 提供高级查询和校验功能，返回清洁的记录视图
 *
 * 职责范围：
 * - 聚合读取操作（结合多个查询条件）
 * - 基础校验逻辑（状态、时效性、上下文匹配）
 * - 返回清洁的记录视图（隐藏敏感信息）
 * - 业务规则验证
 */
@Injectable()
export class VerificationReadService {
  constructor(private readonly readRepository: VerificationRecordReadRepository) {}

  /**
   * 根据 token 查找可消费的验证记录
   *
   * 包含完整的业务校验：
   * - 记录存在性
   * - 状态校验（必须为 ACTIVE）
   * - 时效性校验（未过期且已生效）
   * - 上下文匹配校验（可选）
   *
   * @param token 明文 token
   * @param audience 客户端类型（可选，用于上下文校验）
   * @param email 邮箱地址（可选，用于上下文校验）
   * @param phone 手机号码（可选，用于上下文校验）
   * @returns 清洁的验证记录视图
   */
  async findConsumableRecord(
    token: string,
    audience?: AudienceTypeEnum | null,
    email?: string | null,
    phone?: string | null,
  ): Promise<VerificationRecordView> {
    // 生成 token 指纹（不掺入 audience）
    const tokenFp = TokenFingerprintHelper.generateTokenFingerprint({ token });

    // 查找活跃记录
    const record = await this.readRepository.findActiveByTokenFp(tokenFp);
    if (!record) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND, '验证记录不存在或已失效');
    }

    // 校验记录状态
    this.validateRecordStatus(record);

    // 校验时效性
    this.validateRecordTiming(record);

    // 校验上下文匹配（通过 payload 字段）
    if (audience || email || phone) {
      this.readRepository.ensureContextMatch(record, audience, email, phone);
    }

    // 返回清洁的记录视图
    return this.toCleanView(record);
  }

  /**
   * 校验记录状态
   * @param record 验证记录实体
   */
  private validateRecordStatus(record: VerificationRecordEntity): void {
    if (record.status !== VerificationRecordStatus.ACTIVE) {
      const statusMessages = {
        [VerificationRecordStatus.CONSUMED]: '验证记录已被消费',
        [VerificationRecordStatus.REVOKED]: '验证记录已被撤销',
        [VerificationRecordStatus.EXPIRED]: '验证记录已过期',
      };

      const message = statusMessages[record.status] || '验证记录状态无效';

      throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_ACTIVE, message, {
        recordId: record.id,
        status: record.status,
      });
    }
  }

  /**
   * 校验记录时效性
   * @param record 验证记录实体
   */
  private validateRecordTiming(record: VerificationRecordEntity): void {
    const now = new Date();

    // 检查是否已过期
    if (record.expiresAt <= now) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_EXPIRED, '验证记录已过期', {
        recordId: record.id,
        expiresAt: record.expiresAt.toISOString(),
        currentTime: now.toISOString(),
      });
    }

    // 检查是否还未生效（如果设置了 notBefore）
    if (record.notBefore && record.notBefore > now) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_NOT_ACTIVE_YET, '验证记录尚未生效', {
        recordId: record.id,
        notBefore: record.notBefore.toISOString(),
        currentTime: now.toISOString(),
      });
    }
  }

  /**
   * 转换为清洁的记录视图
   * 隐藏敏感信息，只返回必要的字段
   *
   * @param record 验证记录实体
   * @returns 清洁的记录视图
   */
  private toCleanView(record: VerificationRecordEntity): VerificationRecordView {
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      expiresAt: record.expiresAt,
      notBefore: record.notBefore,
      targetAccountId: record.targetAccountId,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      payload: record.payload,
      issuedByAccountId: record.issuedByAccountId,
      createdAt: record.createdAt,
      // 注意：不包含 tokenFp、consumedByAccountId、consumedAt、updatedAt 等敏感信息
    };
  }
}

/**
 * 验证记录清洁视图
 * 用于返回给调用方的安全数据结构
 */
export interface VerificationRecordView {
  /** 记录 ID */
  id: number;
  /** 记录类型 */
  type: string;
  /** 记录状态 */
  status: VerificationRecordStatus;
  /** 过期时间 */
  expiresAt: Date;
  /** 生效时间 */
  notBefore: Date | null;
  /** 目标账号 ID */
  targetAccountId: number | null;
  /** 主体类型 */
  subjectType: string | null;
  /** 主体 ID */
  subjectId: number | null;
  /** 载荷数据 */
  payload: Record<string, unknown> | null;
  /** 签发者账号 ID */
  issuedByAccountId: number | null;
  /** 创建时间 */
  createdAt: Date;
}
