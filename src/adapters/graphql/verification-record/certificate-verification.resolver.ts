// src/adapters/graphql/verification-record/certificate-verification.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import {
  DomainError,
  PERMISSION_ERROR,
  VERIFICATION_RECORD_ERROR,
} from '@core/common/errors/domain-error';
import { Injectable, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { currentUser } from '@src/adapters/graphql/decorators/current-user.decorator';
import { Public } from '@src/adapters/graphql/decorators/public.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { ConsumeVerificationRecordUsecase } from '@src/usecases/verification-record/consume-verification-record.usecase';
import { FindVerificationRecordUsecase } from '@src/usecases/verification-record/find-verification-record.usecase';
import {
  ConsumeCertificateInput,
  ConsumeCertificateResult,
  VerifyCertificateInput,
  VerifyCertificateResult,
} from './dto/consume-certificate.dto';

/**
 * 证书验证与消费 GraphQL 解析器
 * 处理证书验证和消费相关的 GraphQL 操作
 */
@Injectable()
@Resolver()
export class CertificateVerificationResolver {
  constructor(
    private readonly consumeVerificationRecordUsecase: ConsumeVerificationRecordUsecase,
    private readonly findVerificationRecordUsecase: FindVerificationRecordUsecase,
  ) {}

  /**
   * 验证证书
   * 公开接口，无需登录即可访问
   * @param token 证书 token
   * @param input 验证证书输入参数
   * @returns 验证结果
   */
  @Public()
  @Query(() => VerifyCertificateResult, { description: '验证证书' })
  async verifyCertificate(
    @Args('token', { type: () => String, nullable: true }) token?: string,
    @Args('input', { type: () => VerifyCertificateInput, nullable: true })
    input?: VerifyCertificateInput,
  ): Promise<VerifyCertificateResult> {
    // 优先使用 token 参数，其次使用 input.token
    const actualToken = token || (input?.token ?? '');
    const expectedType = input?.expectedType;

    if (!actualToken) {
      // 早返回，避免计算空串的指纹，也更符合直觉
      return { valid: false, certificate: undefined };
    }
    try {
      // 查找验证记录，公开验证时忽略 target 限制
      const record = await this.findVerificationRecordUsecase.findActiveConsumableByToken({
        token: actualToken,
        // 推荐：用 undefined 表示“忽略 target 限制”，不要用魔数 0
        forAccountId: undefined,
        expectedType,
        ignoreTargetRestriction: true,
      });

      if (!record) {
        return {
          valid: false,
          certificate: undefined,
        };
      }

      return {
        valid: true,
        certificate: {
          id: String(record.id),
          type: record.type,
          status: record.status,
          consumedAt: record.consumedAt ?? undefined,
        },
      };
    } catch {
      // 任何错误都视为验证失败
      return {
        valid: false,
        certificate: undefined,
      };
    }
  }

  /**
   * 消费证书
   * 需要登录后才能消费
   * @param token 证书 token
   * @param input 消费证书输入参数
   * @param user 当前用户
   * @returns 消费结果
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => ConsumeCertificateResult, { description: '消费证书' })
  async consumeCertificate(
    @Args('token', { type: () => String, nullable: true }) token?: string,
    @Args('input', { type: () => ConsumeCertificateInput, nullable: true })
    input?: ConsumeCertificateInput,
    @currentUser() user?: JwtPayload,
  ): Promise<ConsumeCertificateResult> {
    // 优先使用 token 参数，其次使用 input.token
    const actualToken = token || (input?.token ?? '');
    const expectedType = input?.expectedType;
    const consumedByAccountId = user?.sub; // 如果用户已登录，使用其账号 ID

    if (!actualToken) {
      return { success: false, message: '缺少验证码 token' };
    }

    try {
      // 消费验证记录，使用事务版本确保原子性操作
      const record = await this.consumeVerificationRecordUsecase.consumeByTokenInTransaction(
        actualToken,
        consumedByAccountId,
        expectedType, // 传入期望类型，让 usecase 在 SQL 层面进行类型检查
      );

      return {
        success: true,
        message: '证书消费成功',
        record: {
          id: String(record.id),
          type: record.type,
          status: record.status,
          consumedAt: record.consumedAt ?? undefined,
        },
      };
    } catch (error: unknown) {
      // 处理常见错误
      if (error instanceof DomainError) {
        // 根据错误代码返回友好的错误消息
        switch (error.code) {
          case PERMISSION_ERROR.ACCESS_DENIED:
            return { success: false, message: '需要登录或无权限消费此验证码' };
          case VERIFICATION_RECORD_ERROR.RECORD_ALREADY_CONSUMED:
            return {
              success: false,
              message: '验证码已被消费',
            };
          case VERIFICATION_RECORD_ERROR.RECORD_EXPIRED:
            return {
              success: false,
              message: '验证码已过期',
            };
          case VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID:
          case VERIFICATION_RECORD_ERROR.TYPE_MISMATCH:
          case VERIFICATION_RECORD_ERROR.TARGET_ACCOUNT_MISMATCH:
            return {
              success: false,
              message: '无效的验证码',
            };
          default:
            return {
              success: false,
              message: '验证码消费失败',
            };
        }
      }

      // 处理非 DomainError 的其他错误
      return {
        success: false,
        message: '验证码消费失败',
      };
    }
  }
}
