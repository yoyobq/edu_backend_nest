// src/adapters/graphql/course/workflows/session-enrollment.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import {
  EnrollLearnerToSessionUsecase,
  type EnrollLearnerToSessionOutput,
} from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { EnrollLearnerToSessionInputGql } from './dto/enrollment.input';
import { EnrollLearnerToSessionResultGql, EnrollmentOutputGql } from './dto/enrollment.result';

/**
 * 节次报名 GraphQL Resolver
 * 适配器层：将 GraphQL 输入映射为 usecase 输入，并返回 usecase 输出。
 * 权限由 usecase 内部校验，外层启用 JwtAuthGuard 保护。
 */
@Resolver(() => EnrollmentOutputGql)
export class SessionEnrollmentResolver {
  constructor(private readonly enrollUsecase: EnrollLearnerToSessionUsecase) {}

  /**
   * 学员报名到指定节次
   * @param user 当前登录用户的 JWT 载荷
   * @param input 报名输入（节次/学员/备注）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => EnrollLearnerToSessionResultGql, { name: 'enrollLearnerToSession' })
  async enrollLearnerToSession(
    @currentUser() user: JwtPayload,
    @Args('input') { sessionId, learnerId, remark }: EnrollLearnerToSessionInputGql,
  ): Promise<EnrollLearnerToSessionResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result: EnrollLearnerToSessionOutput = await this.enrollUsecase.execute(session, {
      sessionId,
      learnerId,
      remark: remark ?? null,
    });
    return {
      enrollment: {
        id: result.enrollment.id,
        sessionId: result.enrollment.sessionId,
        learnerId: result.enrollment.learnerId,
        customerId: result.enrollment.customerId,
        isCanceled: result.enrollment.isCanceled,
        remark: result.enrollment.remark,
      },
      isNewlyCreated: result.isNewlyCreated,
    } as EnrollLearnerToSessionResultGql;
  }
}
