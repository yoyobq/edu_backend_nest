// src/modules/verification-record/services/verification-read.service.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import {
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
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

    // 检查是否已过期（包含 180 秒宽限期）
    const gracePeriodMs = 180 * 1000; // 180 秒宽限期
    const expiresAtWithGracePeriod = new Date(record.expiresAt.getTime() + gracePeriodMs);

    if (expiresAtWithGracePeriod <= now) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.RECORD_EXPIRED, '验证记录已过期', {
        recordId: record.id,
        expiresAt: record.expiresAt.toISOString(),
        currentTime: now.toISOString(),
        gracePeriodSeconds: 180,
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
   * 从原始 payload 中提取公开的非敏感字段
   *
   * @param payload 原始载荷数据
   * @returns 公开载荷数据
   */
  private extractPublicPayload(
    payload: Record<string, unknown> | null,
  ): VerificationRecordPublicPayload | null {
    if (!payload) {
      return null;
    }

    const publicPayload: VerificationRecordPublicPayload = {};

    // 白名单：只提取非敏感的公开字段
    const allowedFields = [
      'audience',
      'flowId',
      'title',
      'description',
      'issuer',
      'verifyUrl',
      'inviteUrl',
      'roleName',
    ];

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        let value = payload[field];

        // 对 URL 字段进行安全净化，移除敏感查询参数和 hash
        if ((field === 'verifyUrl' || field === 'inviteUrl') && typeof value === 'string') {
          const sanitizedValue = this.sanitizeUrl(value);
          // 如果净化失败（返回 null），则不包含该字段
          if (sanitizedValue !== null) {
            value = sanitizedValue;
          } else {
            // 跳过该字段，不添加到 publicPayload 中
            continue;
          }
        }

        publicPayload[field] = value;
      }
    }

    return Object.keys(publicPayload).length > 0 ? publicPayload : null;
  }

  /**
   * 净化 URL，移除敏感查询参数和 hash 片段
   *
   * 安全策略：
   * - 保留 origin + pathname
   * - 只保留白名单查询参数（如 utm_ 系列）
   * - 明确排除敏感参数（token、code、signature 等）
   * - 移除 hash 片段
   *
   * @param url 原始 URL
   * @returns 净化后的安全 URL，解析失败时返回 null
   */
  private sanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // 敏感参数黑名单（精确匹配）
      const sensitiveParams = new Set([
        'token',
        'code',
        'signature',
        'secret',
        'key',
        'auth',
        'access_token',
        'refresh_token',
        'session',
        'sid',
        'csrf',
        'nonce',
        'state',
        'ticket',
      ]);

      // 安全参数前缀白名单
      const safeParamPrefixes = ['utm_', 'fb_', 'gclid', 'fbclid'];

      // 安全参数精确匹配白名单
      const safeParamExact = new Set([
        'ref',
        'source',
        'from',
        'lang',
        'locale',
        'theme',
        'version',
        'page',
        'tab',
        'view',
      ]);

      // 创建新的 URLSearchParams，只保留安全参数
      const newSearchParams = new URLSearchParams();

      for (const [key, value] of urlObj.searchParams.entries()) {
        const lowerKey = key.toLowerCase();

        // 检查是否为敏感参数（精确匹配）
        const isSensitive = sensitiveParams.has(lowerKey);

        // 检查是否为安全参数（前缀匹配或精确匹配）
        const isSafePrefix = safeParamPrefixes.some((prefix) => lowerKey.startsWith(prefix));
        const isSafeExact = safeParamExact.has(lowerKey);
        const isSafe = isSafePrefix || isSafeExact;

        // 只保留安全参数，排除敏感参数
        if (isSafe && !isSensitive) {
          newSearchParams.append(key, value);
        }
      }

      // 构建净化后的 URL：origin + pathname + 安全查询参数
      const sanitizedUrl = new URL(urlObj.origin + urlObj.pathname);
      sanitizedUrl.search = newSearchParams.toString();

      return sanitizedUrl.toString();
    } catch {
      // 如果 URL 解析失败，返回 null 而不是空字符串
      // console.warn(`URL 净化失败: ${url}`, error);
      return null;
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
      publicPayload: this.extractPublicPayload(record.payload),
      issuedByAccountId: record.issuedByAccountId,
      createdAt: record.createdAt,
      // 注意：不包含 tokenFp、consumedByAccountId、consumedAt、updatedAt 等敏感信息
      // 注意：不包含原始 payload，避免泄露 email/phone 等 PII 信息
    };
  }
}

/**
 * 验证记录公开载荷数据
 * 只包含对上层有用且非敏感的字段
 */
export interface VerificationRecordPublicPayload {
  /** 客户端类型 */
  audience?: AudienceTypeEnum;
  /** 流程 ID */
  flowId?: string;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 签发机构 */
  issuer?: string;
  /** 验证链接（不含敏感参数） */
  verifyUrl?: string;
  /** 邀请链接（不含敏感参数） */
  inviteUrl?: string;
  /** 角色名称（非敏感） */
  roleName?: string;
  /** 其他非敏感的业务字段 */
  [key: string]: unknown;
}

/**
 * 验证记录清洁视图
 * 用于返回给调用方的安全数据结构
 *
 * 安全设计原则：
 * - 移除原始 payload，避免泄露 email/phone 等 PII 信息
 * - 使用 publicPayload 白名单，只导出对上层有用且非敏感的字段
 * - 即使被上层/日志/埋点无意中打印，也不会泄露敏感信息
 */
export interface VerificationRecordView {
  /** 记录 ID */
  id: number;
  /** 记录类型 */
  type: VerificationRecordType;
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
  /** 公开载荷数据（仅包含非敏感字段） */
  publicPayload: VerificationRecordPublicPayload | null;
  /** 签发者账号 ID */
  issuedByAccountId: number | null;
  /** 创建时间 */
  createdAt: Date;
}
