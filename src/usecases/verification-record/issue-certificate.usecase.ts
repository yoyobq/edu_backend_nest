// src/usecases/verification-record/issue-certificate.usecase.ts

import { JwtPayload } from '@app-types/jwt.types';
import {
  CertificatePayload,
  SubjectType,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import {
  DomainError,
  PERMISSION_ERROR,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { VerificationRecordEntity } from '@src/modules/verification-record/verification-record.entity';
import {
  CreateVerificationRecordUsecase,
  CreateVerificationRecordUsecaseResult,
} from './create-verification-record.usecase';

/**
 * 单个证书签发参数
 */
export interface IssueSingleCertificateParams {
  /** 证书类型 */
  certificateType: VerificationRecordType;
  /** 目标账号 ID */
  targetAccountId: number;
  /** 主体类型 */
  subjectType?: SubjectType;
  /** 主体 ID */
  subjectId?: number;
  /** 证书载荷数据 */
  payload: CertificatePayload;
  /** 过期时间（小时数，默认 8760 小时 = 1 年） */
  expiresInHours?: number;
  /** 生效时间（可选） */
  notBefore?: Date;
  /** 自定义 token（可选） */
  customToken?: string;
  /** token 长度（默认 64） */
  tokenLength?: number;
}

/**
 * 批量证书签发参数
 */
export interface IssueBatchCertificatesParams {
  /** 证书类型 */
  certificateType: VerificationRecordType;
  /** 批量签发目标列表 */
  targets: Array<{
    /** 目标账号 ID */
    targetAccountId: number;
    /** 主体类型 */
    subjectType?: SubjectType;
    /** 主体 ID */
    subjectId?: number;
    /** 个性化载荷数据（会与通用载荷合并） */
    personalizedPayload?: Partial<CertificatePayload>;
  }>;
  /** 通用证书载荷数据 */
  commonPayload: CertificatePayload;
  /** 过期时间（小时数，默认 8760 小时 = 1 年） */
  expiresInHours?: number;
  /** 生效时间（可选） */
  notBefore?: Date;
  /** token 长度（默认 64） */
  tokenLength?: number;
}

/**
 * 证书签发用例参数
 */
export interface IssueCertificateUsecaseParams {
  /** 签发者信息 */
  issuer: JwtPayload;
  /** 单个证书签发参数 */
  single?: IssueSingleCertificateParams;
  /** 批量证书签发参数 */
  batch?: IssueBatchCertificatesParams;
  // 移除 manager 参数，事务管理应该在更高层处理
}

/**
 * 证书签发结果
 */
export interface IssueCertificateResult {
  /** 签发的证书记录列表 */
  certificates: Array<{
    /** 验证记录实体 */
    record: VerificationRecordEntity;
    /** 明文 token */
    token: string;
    /** 目标账号 ID */
    targetAccountId: number;
  }>;
  /** 签发总数 */
  totalIssued: number;
}

/**
 * 证书签发用例
 * 负责处理单个和批量证书的签发逻辑
 */
@Injectable()
export class IssueCertificateUsecase {
  constructor(private readonly createVerificationRecordUsecase: CreateVerificationRecordUsecase) {}

  /**
   * 执行证书签发
   * @param params 签发参数
   * @returns 签发结果
   */
  async execute(params: IssueCertificateUsecaseParams): Promise<IssueCertificateResult> {
    const { issuer, single, batch } = params;

    // 验证权限：只有 manager 角色可以签发证书
    this.validateIssuerPermissions(issuer);

    // 验证参数：single 和 batch 必须二选一
    if (!single && !batch) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_PARAMS,
        '必须提供 single 或 batch 参数之一',
      );
    }

    if (single && batch) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_PARAMS,
        'single 和 batch 参数不能同时提供',
      );
    }

    if (single) {
      return await this.issueSingleCertificate(single, issuer);
    }

    if (batch) {
      return await this.issueBatchCertificates(batch, issuer);
    }

    // TypeScript 类型守卫，实际不会执行到这里
    throw new DomainError(VERIFICATION_RECORD_ERROR.INVALID_PARAMS, '无效的签发参数');
  }

  /**
   * 验证签发者权限
   * @param issuer 签发者信息
   */
  private validateIssuerPermissions(issuer: JwtPayload): void {
    if (!issuer.accessGroup || !Array.isArray(issuer.accessGroup)) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '签发者权限信息缺失');
    }

    const hasManagerRole = issuer.accessGroup.map((role) => role.toLowerCase()).includes('manager');

    if (!hasManagerRole) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '只有管理员可以签发证书', {
        requiredRole: 'manager',
        userRoles: issuer.accessGroup,
      });
    }
  }

  /**
   * 验证证书类型
   * @param certificateType 证书类型
   */
  private validateCertificateType(certificateType: VerificationRecordType): void {
    const validCertificateTypes = [
      VerificationRecordType.COURSE_COMPLETION_CERTIFICATE,
      VerificationRecordType.SKILL_CERTIFICATION,
      VerificationRecordType.TRAINING_CERTIFICATE,
      VerificationRecordType.ACHIEVEMENT_BADGE,
      VerificationRecordType.PARTICIPATION_PROOF,
    ];

    if (!validCertificateTypes.includes(certificateType)) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.INVALID_TYPE, '无效的证书类型', {
        certificateType,
        validTypes: validCertificateTypes,
      });
    }
  }

  /**
   * 验证证书载荷数据
   * @param payload 载荷数据
   */
  private validateCertificatePayload(payload: CertificatePayload): void {
    if (!payload.title || payload.title.trim().length === 0) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.INVALID_PARAMS, '证书标题不能为空');
    }

    if (!payload.issuer || payload.issuer.trim().length === 0) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.INVALID_PARAMS, '颁发机构不能为空');
    }

    // 验证标题长度
    if (payload.title.length > 200) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_PARAMS,
        '证书标题长度不能超过 200 个字符',
      );
    }

    // 验证描述长度
    if (payload.description && payload.description.length > 1000) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_PARAMS,
        '证书描述长度不能超过 1000 个字符',
      );
    }
  }

  /**
   * 安全地将 CertificatePayload 转换为 Record<string, unknown>
   * @param payload 证书载荷数据
   * @returns 转换后的记录对象
   */
  private convertPayloadToRecord(payload: CertificatePayload): Record<string, unknown> {
    // 创建一个新的对象，确保类型安全
    const record: Record<string, unknown> = {
      title: payload.title,
      issuer: payload.issuer,
    };

    // 添加可选字段
    if (payload.description !== undefined) {
      record.description = payload.description;
    }
    if (payload.courseId !== undefined) {
      record.courseId = payload.courseId;
    }
    if (payload.skillId !== undefined) {
      record.skillId = payload.skillId;
    }
    if (payload.score !== undefined) {
      record.score = payload.score;
    }
    if (payload.grade !== undefined) {
      record.grade = payload.grade;
    }
    if (payload.templateId !== undefined) {
      record.templateId = payload.templateId;
    }
    if (payload.metadata !== undefined) {
      record.metadata = payload.metadata;
    }

    return record;
  }

  /**
   * 签发单个证书
   * @param params 单个签发参数
   * @param issuer 签发者信息
   * @returns 签发结果
   */
  private async issueSingleCertificate(
    params: IssueSingleCertificateParams,
    issuer: JwtPayload,
  ): Promise<IssueCertificateResult> {
    const {
      certificateType,
      targetAccountId,
      subjectType,
      subjectId,
      payload,
      expiresInHours = 8760, // 默认 1 年
      notBefore,
      customToken,
      tokenLength = 64,
    } = params;

    // 验证证书类型和载荷
    this.validateCertificateType(certificateType);
    this.validateCertificatePayload(payload);

    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    // 调用基础创建用例
    const result: CreateVerificationRecordUsecaseResult =
      await this.createVerificationRecordUsecase.execute({
        type: certificateType,
        targetAccountId,
        subjectType,
        subjectId,
        payload: this.convertPayloadToRecord(payload),
        issuedByAccountId: issuer.sub,
        expiresAt,
        notBefore,
        customToken,
        tokenLength,
        generateNumericCode: false, // 证书使用字符串 token
      });

    return {
      certificates: [
        {
          record: result.record,
          token: result.token,
          targetAccountId,
        },
      ],
      totalIssued: 1,
    };
  }

  /**
   * 批量签发证书
   * @param params 批量签发参数
   * @param issuer 签发者信息
   * @returns 签发结果
   */
  private async issueBatchCertificates(
    params: IssueBatchCertificatesParams,
    issuer: JwtPayload,
  ): Promise<IssueCertificateResult> {
    const {
      certificateType,
      targets,
      commonPayload,
      expiresInHours = 8760, // 默认 1 年
      notBefore,
      tokenLength = 64,
    } = params;

    // 验证证书类型和通用载荷
    this.validateCertificateType(certificateType);
    this.validateCertificatePayload(commonPayload);

    // 验证目标列表
    if (!targets || targets.length === 0) {
      throw new DomainError(VERIFICATION_RECORD_ERROR.INVALID_PARAMS, '批量签发目标列表不能为空');
    }

    if (targets.length > 1000) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.INVALID_PARAMS,
        '单次批量签发数量不能超过 1000 个',
      );
    }

    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const certificates: Array<{
      record: VerificationRecordEntity;
      token: string;
      targetAccountId: number;
    }> = [];

    // 批量签发
    for (const target of targets) {
      // 合并通用载荷和个性化载荷
      const mergedPayload: CertificatePayload = {
        ...commonPayload,
        ...target.personalizedPayload,
      };

      // 验证合并后的载荷
      this.validateCertificatePayload(mergedPayload);

      // 签发单个证书
      const result: CreateVerificationRecordUsecaseResult =
        await this.createVerificationRecordUsecase.execute({
          type: certificateType,
          targetAccountId: target.targetAccountId,
          subjectType: target.subjectType,
          subjectId: target.subjectId,
          payload: this.convertPayloadToRecord(mergedPayload),
          issuedByAccountId: issuer.sub,
          expiresAt,
          notBefore,
          tokenLength,
          generateNumericCode: false, // 证书使用字符串 token
        });

      certificates.push({
        record: result.record,
        token: result.token,
        targetAccountId: target.targetAccountId,
      });
    }

    return {
      certificates,
      totalIssued: certificates.length,
    };
  }
}
