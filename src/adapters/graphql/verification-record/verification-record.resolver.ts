// src/adapters/graphql/verification-record/verification-record.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { IssueCertificateUsecase } from '@src/usecases/verification-record/issue-certificate.usecase';
import {
  IssueBatchCertificatesInput,
  IssueCertificateResult,
  IssueSingleCertificateInput,
} from './dto/verification-record';

/**
 * 验证记录 GraphQL 解析器
 * 主要处理证书相关的 GraphQL 操作
 */
@Resolver()
export class VerificationRecordResolver {
  constructor(private readonly issueCertificateUsecase: IssueCertificateUsecase) {}

  /**
   * 安全解析 JSON 字符串
   * @param jsonString JSON 字符串
   * @returns 解析后的对象或 undefined
   */
  private safeParseJson(jsonString?: string): Record<string, unknown> | undefined {
    if (!jsonString) {
      return undefined;
    }

    try {
      // 使用类型断言明确指定 JSON.parse 的返回类型
      const parsed: unknown = JSON.parse(jsonString);
      // 确保解析结果是对象类型
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 签发单个证书
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @Mutation(() => IssueCertificateResult, { description: '签发单个证书' })
  async issueSingleCertificate(
    @Args('input') input: IssueSingleCertificateInput,
    @currentUser() user: JwtPayload,
  ): Promise<IssueCertificateResult> {
    const result = await this.issueCertificateUsecase.execute({
      issuer: user,
      single: {
        certificateType: input.certificateType,
        targetAccountId: input.targetAccountId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: {
          title: input.title,
          description: input.description,
          issuer: input.issuer,
          courseId: input.courseId,
          skillId: input.skillId,
          score: input.score,
          grade: input.grade,
          templateId: input.templateId,
          metadata: this.safeParseJson(input.metadata),
        },
        expiresInHours: input.expiresInHours,
        notBefore: input.notBefore,
        customToken: input.customToken,
        tokenLength: input.tokenLength,
      },
    });

    return {
      certificates: result.certificates.map((cert) => ({
        recordId: cert.record.id,
        token: cert.token,
        targetAccountId: cert.targetAccountId,
      })),
      totalIssued: result.totalIssued,
    };
  }

  /**
   * 批量签发证书
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @Mutation(() => IssueCertificateResult, { description: '批量签发证书' })
  async issueBatchCertificates(
    @Args('input') input: IssueBatchCertificatesInput,
    @currentUser() user: JwtPayload,
  ): Promise<IssueCertificateResult> {
    const result = await this.issueCertificateUsecase.execute({
      issuer: user,
      batch: {
        certificateType: input.certificateType,
        targets: input.targets.map((target) => ({
          targetAccountId: target.targetAccountId,
          subjectType: target.subjectType,
          subjectId: target.subjectId,
          personalizedPayload: target.personalizedPayload
            ? {
                title: target.personalizedPayload.title,
                description: target.personalizedPayload.description,
                issuer: target.personalizedPayload.issuer,
                courseId: target.personalizedPayload.courseId,
                skillId: target.personalizedPayload.skillId,
                score: target.personalizedPayload.score,
                grade: target.personalizedPayload.grade,
                templateId: target.personalizedPayload.templateId,
                metadata: this.safeParseJson(target.personalizedPayload.metadata),
              }
            : undefined,
        })),
        commonPayload: {
          title: input.commonPayload.title,
          description: input.commonPayload.description,
          issuer: input.commonPayload.issuer,
          courseId: input.commonPayload.courseId,
          skillId: input.commonPayload.skillId,
          score: input.commonPayload.score,
          grade: input.commonPayload.grade,
          templateId: input.commonPayload.templateId,
          metadata: this.safeParseJson(input.commonPayload.metadata),
        },
        expiresInHours: input.expiresInHours,
        notBefore: input.notBefore,
        tokenLength: input.tokenLength,
      },
    });

    return {
      certificates: result.certificates.map((cert) => ({
        recordId: cert.record.id,
        token: cert.token,
        targetAccountId: cert.targetAccountId,
      })),
      totalIssued: result.totalIssued,
    };
  }
}
