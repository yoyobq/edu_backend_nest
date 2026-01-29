// src/adapters/graphql/course/workflows/session-enrollment.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CancelSeriesEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-series-enrollment.usecase';
import {
  EnrollLearnerToSessionUsecase,
  type EnrollLearnerToSessionOutput,
} from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { ListLearnerEnrolledSessionIdsBySeriesUsecase } from '@src/usecases/course/workflows/list-learner-enrolled-session-ids-by-series.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CancelEnrollmentInputGql } from './dto/cancel-enrollment.input';
import { CancelEnrollmentResultGql } from './dto/cancel-enrollment.result';
import { CancelSeriesEnrollmentInputGql } from './dto/cancel-series-enrollment.input';
import { CancelSeriesEnrollmentResultGql } from './dto/cancel-series-enrollment.result';
import {
  EnrollLearnerToSessionInputGql,
  ListLearnerEnrolledSessionIdsBySeriesInputGql,
} from './dto/enrollment.input';
import {
  EnrollLearnerToSessionResultGql,
  EnrollmentOutputGql,
  ListLearnerEnrolledSessionIdsBySeriesResultGql,
} from './dto/enrollment.result';

/**
 * 节次报名 GraphQL Resolver
 * 适配器层：将 GraphQL 输入映射为 usecase 输入，并返回 usecase 输出。
 * 权限由 usecase 内部校验，外层启用 JwtAuthGuard 保护。
 */
@Resolver(() => EnrollmentOutputGql)
export class SessionEnrollmentResolver {
  constructor(
    private readonly enrollUsecase: EnrollLearnerToSessionUsecase,
    private readonly cancelEnrollmentUsecase: CancelEnrollmentUsecase,
    private readonly cancelSeriesEnrollmentUsecase: CancelSeriesEnrollmentUsecase,
    private readonly listEnrolledSessionIdsUsecase: ListLearnerEnrolledSessionIdsBySeriesUsecase,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @Mutation(() => CancelEnrollmentResultGql, { name: 'cancelSessionEnrollment' })
  async cancelSessionEnrollment(
    @currentUser() user: JwtPayload,
    @Args('input') { enrollmentId, sessionId, learnerId, reason }: CancelEnrollmentInputGql,
  ): Promise<CancelEnrollmentResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.cancelEnrollmentUsecase.execute(session, {
      enrollmentId,
      sessionId,
      learnerId,
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

  /**
   * 取消学员在某开课班中的报名（批量取消该开课班下的多节课报名）
   * @param user 当前登录用户的 JWT 载荷
   * @param input 取消输入（开课班与学员与原因）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => CancelSeriesEnrollmentResultGql, { name: 'cancelSeriesEnrollment' })
  async cancelSeriesEnrollment(
    @currentUser() user: JwtPayload,
    @Args('input') input: CancelSeriesEnrollmentInputGql,
  ): Promise<CancelSeriesEnrollmentResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.cancelSeriesEnrollmentUsecase.execute({
      session,
      seriesId: input.seriesId,
      learnerId: input.learnerId,
      reason: input.reason ?? null,
    });
    return {
      canceledEnrollmentIds: result.canceledEnrollmentIds,
      unchangedEnrollmentIds: result.unchangedEnrollmentIds,
      failed: result.failed,
    } as CancelSeriesEnrollmentResultGql;
  }

  /**
   * 查询学员在指定开课班中的已报名节次 ID 列表
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入（开课班与学员）
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListLearnerEnrolledSessionIdsBySeriesResultGql, {
    name: 'listLearnerEnrolledSessionIdsBySeries',
  })
  async listLearnerEnrolledSessionIdsBySeries(
    @currentUser() user: JwtPayload,
    @Args('input') input: ListLearnerEnrolledSessionIdsBySeriesInputGql,
  ): Promise<ListLearnerEnrolledSessionIdsBySeriesResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listEnrolledSessionIdsUsecase.execute({
      session,
      seriesId: input.seriesId,
      learnerId: input.learnerId,
    });
    return { sessionIds: result.sessionIds };
  }
}
