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
        return this.handleConsumeCertificateError(error);
      }

      // 处理非 DomainError 的其他错误
      return {
        success: false,
        message: '验证码消费失败',
      };
    }
  }

  /**
   * 处理消费证书时的错误
   * @param error 领域错误
   * @returns 错误响应
   */
  private handleConsumeCertificateError(error: DomainError): ConsumeCertificateResult {
    // 权限相关错误
    if (error.code === PERMISSION_ERROR.ACCESS_DENIED) {
      return { success: false, message: '请先登录，或您无权使用此验证码' };
    }

    // 验证记录相关错误
    switch (error.code) {
      case VERIFICATION_RECORD_ERROR.RECORD_NOT_FOUND:
        return { success: false, message: '验证码不存在或已失效' };
      case VERIFICATION_RECORD_ERROR.RECORD_ALREADY_CONSUMED:
        return { success: false, message: '验证码已被使用，无法重复使用' };
      case VERIFICATION_RECORD_ERROR.RECORD_EXPIRED:
        return { success: false, message: '验证码已过期，请重新获取' };
      case VERIFICATION_RECORD_ERROR.RECORD_NOT_ACTIVE_YET:
        return { success: false, message: '验证码尚未到使用时间' };
      case VERIFICATION_RECORD_ERROR.INVALID_TOKEN:
        return { success: false, message: '验证码格式错误' };
      case VERIFICATION_RECORD_ERROR.VERIFICATION_INVALID:
      case VERIFICATION_RECORD_ERROR.TYPE_MISMATCH:
      case VERIFICATION_RECORD_ERROR.TARGET_ACCOUNT_MISMATCH:
        return { success: false, message: '验证码无效或格式错误' };
      case VERIFICATION_RECORD_ERROR.UPDATE_FAILED:
      case VERIFICATION_RECORD_ERROR.CONSUMPTION_FAILED:
        return { success: false, message: '验证码使用失败，请稍后重试' };
      default:
        return { success: false, message: '验证码使用失败，请稍后重试' };
    }
  }
}
