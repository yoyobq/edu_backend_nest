// src/adapters/graphql/course/workflows/session-enrollment.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { CancelEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-enrollment.usecase';
import { CancelSeriesEnrollmentUsecase } from '@src/usecases/course/workflows/cancel-series-enrollment.usecase';
import {
  EnrollLearnerToSeriesUsecase,
  type EnrollLearnerToSeriesOutput,
} from '@src/usecases/course/workflows/enroll-learner-to-series.usecase';
import {
  EnrollLearnerToSessionUsecase,
  type EnrollLearnerToSessionOutput,
} from '@src/usecases/course/workflows/enroll-learner-to-session.usecase';
import { HasCustomerEnrollmentBySeriesUsecase } from '@src/usecases/course/workflows/has-customer-enrollment-by-series.usecase';
import { HasLearnerEnrollmentUsecase } from '@src/usecases/course/workflows/has-learner-enrollment.usecase';
import { ListCurrentAccountEnrolledSeriesIdsUsecase } from '@src/usecases/course/workflows/list-current-account-enrolled-series-ids.usecase';
import { ListCurrentAccountEnrolledSessionIdsUsecase } from '@src/usecases/course/workflows/list-current-account-enrolled-session-ids.usecase';
import { ListLearnerEnrolledSessionIdsBySeriesUsecase } from '@src/usecases/course/workflows/list-learner-enrolled-session-ids-by-series.usecase';
import { ListSessionEnrollmentsUsecase } from '@src/usecases/course/workflows/list-session-enrollments.usecase';
import { RequestSessionLeaveUsecase } from '@src/usecases/course/workflows/request-session-leave.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CancelEnrollmentInputGql } from './dto/cancel-enrollment.input';
import { CancelEnrollmentResultGql } from './dto/cancel-enrollment.result';
import { CancelSeriesEnrollmentInputGql } from './dto/cancel-series-enrollment.input';
import { CancelSeriesEnrollmentResultGql } from './dto/cancel-series-enrollment.result';
import {
  EnrollLearnerToSeriesInputGql,
  EnrollLearnerToSessionInputGql,
  HasCustomerEnrollmentBySeriesInputGql,
  HasLearnerEnrollmentInputGql,
  ListLearnerEnrolledSessionIdsBySeriesInputGql,
  ListSessionEnrollmentsInputGql,
  RequestSessionLeaveInputGql,
} from './dto/enrollment.input';
import {
  EnrollLearnerToSeriesFailedItemGql,
  EnrollLearnerToSeriesResultGql,
  EnrollLearnerToSessionResultGql,
  EnrollmentDetailOutputGql,
  EnrollmentOutputGql,
  HasCustomerEnrollmentBySeriesResultGql,
  HasLearnerEnrollmentResultGql,
  ListCurrentAccountEnrolledSeriesIdsResultGql,
  ListCurrentAccountEnrolledSessionsResultGql,
  ListLearnerEnrolledSessionIdsBySeriesResultGql,
  RequestSessionLeaveResultGql,
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
    private readonly enrollSeriesUsecase: EnrollLearnerToSeriesUsecase,
    private readonly cancelEnrollmentUsecase: CancelEnrollmentUsecase,
    private readonly cancelSeriesEnrollmentUsecase: CancelSeriesEnrollmentUsecase,
    private readonly listEnrolledSessionIdsUsecase: ListLearnerEnrolledSessionIdsBySeriesUsecase,
    private readonly hasCustomerEnrollmentBySeriesUsecase: HasCustomerEnrollmentBySeriesUsecase,
    private readonly hasLearnerEnrollmentUsecase: HasLearnerEnrollmentUsecase,
    private readonly listCurrentAccountEnrolledSeriesIdsUsecase: ListCurrentAccountEnrolledSeriesIdsUsecase,
    private readonly listCurrentAccountEnrolledSessionIdsUsecase: ListCurrentAccountEnrolledSessionIdsUsecase,
    private readonly listSessionEnrollmentsUsecase: ListSessionEnrollmentsUsecase,
    private readonly requestSessionLeaveUsecase: RequestSessionLeaveUsecase,
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
        status: result.enrollment.status,
        statusReason: result.enrollment.statusReason,
        remark: result.enrollment.remark,
      },
      isNewlyCreated: result.isNewlyCreated,
    } as EnrollLearnerToSessionResultGql;
  }

  /**
   * 学员请假（节次）
   * @param user 当前登录用户的 JWT 载荷
   * @param input 请假输入
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => RequestSessionLeaveResultGql, { name: 'requestSessionLeave' })
  async requestSessionLeave(
    @currentUser() user: JwtPayload,
    @Args('input') input: RequestSessionLeaveInputGql,
  ): Promise<RequestSessionLeaveResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.requestSessionLeaveUsecase.execute(session, {
      sessionId: input.sessionId,
      learnerId: input.learnerId,
      reason: input.reason ?? null,
    });
    return {
      enrollment: {
        id: result.enrollment.id,
        sessionId: result.enrollment.sessionId,
        learnerId: result.enrollment.learnerId,
        customerId: result.enrollment.customerId,
        status: result.enrollment.status,
        statusReason: result.enrollment.statusReason,
        remark: null,
      },
      isUpdated: result.isUpdated,
    } as RequestSessionLeaveResultGql;
  }

  /**
   * 学员报名到指定开课班（批量报名该开课班下未来节次）
   * @param user 当前登录用户的 JWT 载荷
   * @param input 报名输入（开课班/学员/备注）
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => EnrollLearnerToSeriesResultGql, { name: 'enrollLearnerToSeries' })
  async enrollLearnerToSeries(
    @currentUser() user: JwtPayload,
    @Args('input') input: EnrollLearnerToSeriesInputGql,
  ): Promise<EnrollLearnerToSeriesResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result: EnrollLearnerToSeriesOutput = await this.enrollSeriesUsecase.execute({
      session,
      seriesId: input.seriesId,
      learnerId: input.learnerId,
      remark: input.remark ?? null,
    });
    return {
      createdEnrollmentIds: result.createdEnrollmentIds,
      restoredEnrollmentIds: result.restoredEnrollmentIds,
      unchangedEnrollmentIds: result.unchangedEnrollmentIds,
      failed: result.failed.map(
        (item) =>
          ({
            sessionId: item.sessionId,
            code: item.code,
            message: item.message,
          }) as EnrollLearnerToSeriesFailedItemGql,
      ),
    } as EnrollLearnerToSeriesResultGql;
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
        status: result.enrollment.status,
        statusReason: result.enrollment.statusReason,
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

  /**
   * 查询当前账号名下已报名的开课班 ID 列表
   * @param user 当前登录用户的 JWT 载荷
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListCurrentAccountEnrolledSeriesIdsResultGql, {
    name: 'listCurrentAccountEnrolledSeriesIds',
  })
  async listCurrentAccountEnrolledSeriesIds(
    @currentUser() user: JwtPayload,
  ): Promise<ListCurrentAccountEnrolledSeriesIdsResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listCurrentAccountEnrolledSeriesIdsUsecase.execute({ session });
    return { seriesIds: result.seriesIds };
  }

  /**
   * 查询当前账号名下已报名的节次 ID 列表
   * @param user 当前登录用户的 JWT 载荷
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => ListCurrentAccountEnrolledSessionsResultGql, {
    name: 'listCurrentAccountEnrolledSessions',
  })
  async listCurrentAccountEnrolledSessions(
    @currentUser() user: JwtPayload,
  ): Promise<ListCurrentAccountEnrolledSessionsResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listCurrentAccountEnrolledSessionIdsUsecase.execute({ session });
    return {
      sessionIds: result.sessionIds,
      enrollments: result.items.map((item) => ({
        sessionId: item.sessionId,
        learnerId: item.learnerId,
        learnerName: item.learnerName,
        status: item.status,
        statusReason: item.statusReason,
      })),
    };
  }

  /**
   * 查询节次报名列表
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入（节次）
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [EnrollmentDetailOutputGql], { name: 'listSessionEnrollments' })
  async listSessionEnrollments(
    @currentUser() user: JwtPayload,
    @Args('input') input: ListSessionEnrollmentsInputGql,
  ): Promise<EnrollmentDetailOutputGql[]> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listSessionEnrollmentsUsecase.execute({
      session,
      sessionId: input.sessionId,
    });
    return result.items.map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      learnerId: item.learnerId,
      customerId: item.customerId,
      status: item.status,
      statusReason: item.statusReason,
      remark: item.remark,
    }));
  }

  /**
   * 判断学员是否存在已报名的开课班
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入（学员）
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => HasLearnerEnrollmentResultGql, {
    name: 'hasLearnerEnrollment',
  })
  async hasLearnerEnrollment(
    @currentUser() user: JwtPayload,
    @Args('input') input: HasLearnerEnrollmentInputGql,
  ): Promise<HasLearnerEnrollmentResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.hasLearnerEnrollmentUsecase.execute({
      session,
      learnerId: input.learnerId,
    });
    return { hasEnrollment: result.hasEnrollment };
  }

  /**
   * 判断 customer 在指定开课班中是否已预约
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入（开课班与 customer）
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => HasCustomerEnrollmentBySeriesResultGql, {
    name: 'hasCustomerEnrollmentBySeries',
  })
  async hasCustomerEnrollmentBySeries(
    @currentUser() user: JwtPayload,
    @Args('input') input: HasCustomerEnrollmentBySeriesInputGql,
  ): Promise<HasCustomerEnrollmentBySeriesResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.hasCustomerEnrollmentBySeriesUsecase.execute({
      session,
      seriesId: input.seriesId,
      customerId: input.customerId,
    });
    return { hasEnrollment: result.hasEnrollment };
  }
}
