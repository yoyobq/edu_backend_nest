// src/adapters/graphql/course/workflows/session-cancel.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import {
  CancelEnrollmentUsecase,
  type CancelEnrollmentOutput,
} from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CancelEnrollmentInputGql } from './dto/cancel-enrollment.input';
import {
  CancelEnrollmentOutputGql,
  CancelEnrollmentResultGql,
} from './dto/cancel-enrollment.result';

/**
 * 取消报名 GraphQL Resolver
 * 适配器层：将 GraphQL 输入映射为 usecase 输入，并返回 usecase 输出。
 */
@Resolver(() => CancelEnrollmentOutputGql)
export class SessionCancelResolver {
  constructor(private readonly cancelUsecase: CancelEnrollmentUsecase) {}

  /**
   * 取消报名
   * @param user 当前登录用户的 JWT 载荷
   * @param input 取消输入（报名 ID、原因）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => CancelEnrollmentResultGql, { name: 'cancelEnrollment' })
  async cancelEnrollment(
    @currentUser() user: JwtPayload,
    @Args('input') { enrollmentId, reason }: CancelEnrollmentInputGql,
  ): Promise<CancelEnrollmentResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result: CancelEnrollmentOutput = await this.cancelUsecase.execute(session, {
      enrollmentId,
      reason: reason ?? null,
    });
    return {
      enrollment: {
        id: result.enrollment.id,
        sessionId: result.enrollment.sessionId,
        learnerId: result.enrollment.learnerId,
        customerId: result.enrollment.customerId,
        isCanceled: result.enrollment.isCanceled,
        cancelReason: result.enrollment.cancelReason,
      },
      isUpdated: result.isUpdated,
    } as CancelEnrollmentResultGql;
  }
}
