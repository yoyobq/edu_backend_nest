// 文件位置：src/adapters/graphql/course/workflows/session-attendance.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { BatchRecordAttendanceUsecase } from '@src/usecases/course/workflows/batch-record-attendance.usecase';
import { FinalizeSessionAttendanceUsecase } from '@src/usecases/course/workflows/finalize-session-attendance.usecase';
import { ListFinalizedAttendanceBySeriesUsecase } from '@src/usecases/course/workflows/list-finalized-attendance-by-series.usecase';
import { ListFinalizedAttendanceSeriesUsecase } from '@src/usecases/course/workflows/list-finalized-attendance-series.usecase';
import { ListSessionLeaveRequestsUsecase } from '@src/usecases/course/workflows/list-session-leave-requests.usecase';
import { ListUnfinalizedAttendanceBySeriesUsecase } from '@src/usecases/course/workflows/list-unfinalized-attendance-by-series.usecase';
import { ListUnfinalizedAttendanceSeriesUsecase } from '@src/usecases/course/workflows/list-unfinalized-attendance-series.usecase';
import { LoadSessionAttendanceDetailUsecase } from '@src/usecases/course/workflows/load-session-attendance-detail.usecase';
import { LoadSessionAttendanceSheetUsecase } from '@src/usecases/course/workflows/load-session-attendance-sheet.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import {
  FinalizeSessionAttendanceInputGql,
  FinalizeSessionAttendanceResultGql,
  ListFinalizedAttendanceBySeriesInputGql,
  ListUnfinalizedAttendanceBySeriesInputGql,
  RecordSessionAttendanceInputGql,
  RecordSessionAttendanceResultGql,
} from './dto/attendance.input';
import {
  AttendanceSheetGql,
  AttendanceSheetRowGql,
  FinalizedAttendanceRecordGql,
  FinalizedAttendanceSeriesGql,
  SessionAttendanceDetailGql,
  SessionLeaveRequestListGql,
  UnfinalizedAttendanceRecordGql,
  UnfinalizedAttendanceSeriesGql,
} from './dto/session-attendance.result';

/**
 * 节次点名视图 GraphQL Resolver
 * 适配器层：将 GraphQL 查询映射为 usecase 输入，并返回 usecase 输出。
 */
@Resolver(() => AttendanceSheetRowGql)
export class SessionAttendanceResolver {
  constructor(
    private readonly loadUsecase: LoadSessionAttendanceSheetUsecase,
    private readonly loadDetailUsecase: LoadSessionAttendanceDetailUsecase,
    private readonly recordUsecase: BatchRecordAttendanceUsecase,
    private readonly listLeaveRequestsUsecase: ListSessionLeaveRequestsUsecase,
    private readonly finalizeUsecase: FinalizeSessionAttendanceUsecase,
    private readonly listFinalizedSeriesUsecase: ListFinalizedAttendanceSeriesUsecase,
    private readonly listFinalizedAttendanceBySeriesUsecase: ListFinalizedAttendanceBySeriesUsecase,
    private readonly listUnfinalizedSeriesUsecase: ListUnfinalizedAttendanceSeriesUsecase,
    private readonly listUnfinalizedAttendanceBySeriesUsecase: ListUnfinalizedAttendanceBySeriesUsecase,
  ) {}

  /**
   * 加载指定节次的点名视图
   * @param user 当前登录用户的 JWT 载荷
   * @param sessionId 节次 ID
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => AttendanceSheetGql, { name: 'loadSessionAttendanceSheet' })
  async loadSessionAttendanceSheet(
    @currentUser() user: JwtPayload,
    @Args('sessionId', { type: () => Int }) sessionId: number,
  ): Promise<AttendanceSheetGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.loadUsecase.execute({ session, sessionId });
    return {
      sessionId: result.sessionId,
      isFinalized: result.isFinalized,
      rows: result.rows.map((r) => ({
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        status: String(r.attendanceStatus),
        countApplied: r.countApplied,
        confirmedByCoachId: r.confirmedByCoachId,
        confirmedAt: r.confirmedAt,
        finalized: r.finalized,
        enrollmentStatus: r.status,
        enrollmentStatusReason: r.statusReason,
      })),
    };
  }

  /**
   * 加载指定节次的出勤明细
   * @param user 当前登录用户的 JWT 载荷
   * @param sessionId 节次 ID
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => SessionAttendanceDetailGql, { name: 'loadSessionAttendanceDetail' })
  async loadSessionAttendanceDetail(
    @currentUser() user: JwtPayload,
    @Args('sessionId', { type: () => Int }) sessionId: number,
  ): Promise<SessionAttendanceDetailGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.loadDetailUsecase.execute({ session, sessionId });
    return {
      sessionId: result.sessionId,
      items: result.items.map((item) => ({
        enrollmentId: item.enrollmentId,
        learnerId: item.learnerId,
        learnerName: item.learnerName,
        gender: item.gender,
        age: item.age,
        avatarUrl: item.avatarUrl,
        specialNeeds: item.specialNeeds,
        attendanceStatus: String(item.attendanceStatus),
        countApplied: item.countApplied,
        enrollmentStatus: item.enrollmentStatus,
        enrollmentStatusReason: item.enrollmentStatusReason,
        customerId: item.customerId,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerRemainingSessions: item.customerRemainingSessions,
      })),
    };
  }

  /**
   * 列出未终审出勤关联的开课班列表
   * @param user 当前登录用户的 JWT 载荷
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [UnfinalizedAttendanceSeriesGql], { name: 'listUnfinalizedAttendanceSeries' })
  async listUnfinalizedAttendanceSeries(
    @currentUser() user: JwtPayload,
  ): Promise<UnfinalizedAttendanceSeriesGql[]> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listUnfinalizedSeriesUsecase.execute({ session });
    return result.items.map((item) => ({
      catalogId: item.catalogId,
      catalogTitle: item.catalogTitle,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      leadCoachName: item.leadCoachName,
      status: item.status,
    }));
  }

  /**
   * 按 seriesId 列出未终审出勤记录
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [UnfinalizedAttendanceRecordGql], { name: 'listUnfinalizedAttendanceBySeries' })
  async listUnfinalizedAttendanceBySeries(
    @currentUser() user: JwtPayload,
    @Args('input', { type: () => ListUnfinalizedAttendanceBySeriesInputGql })
    input: ListUnfinalizedAttendanceBySeriesInputGql,
  ): Promise<UnfinalizedAttendanceRecordGql[]> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listUnfinalizedAttendanceBySeriesUsecase.execute({
      session,
      seriesId: input.seriesId,
    });
    return result.items.map((item) => ({
      attendanceId: item.attendanceId,
      sessionId: item.sessionId,
      sessionStartTime: item.sessionStartTime,
      enrollmentId: item.enrollmentId,
      learnerId: item.learnerId,
      learnerName: item.learnerName,
      status: String(item.status),
      countApplied: item.countApplied,
      confirmedByCoachId: item.confirmedByCoachId,
      confirmedByCoachName: item.confirmedByCoachName,
      confirmedAt: item.confirmedAt,
      remark: item.remark,
    }));
  }

  /**
   * 列出已终审出勤关联的开课班列表
   * @param user 当前登录用户的 JWT 载荷
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [FinalizedAttendanceSeriesGql], { name: 'listFinalizedAttendanceSeries' })
  async listFinalizedAttendanceSeries(
    @currentUser() user: JwtPayload,
  ): Promise<FinalizedAttendanceSeriesGql[]> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listFinalizedSeriesUsecase.execute({ session });
    return result.items.map((item) => ({
      catalogId: item.catalogId,
      catalogTitle: item.catalogTitle,
      title: item.title,
      startDate: item.startDate,
      endDate: item.endDate,
      leadCoachName: item.leadCoachName,
      status: item.status,
    }));
  }

  /**
   * 按 seriesId 列出已终审出勤记录
   * @param user 当前登录用户的 JWT 载荷
   * @param input 查询输入
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [FinalizedAttendanceRecordGql], { name: 'listFinalizedAttendanceBySeries' })
  async listFinalizedAttendanceBySeries(
    @currentUser() user: JwtPayload,
    @Args('input', { type: () => ListFinalizedAttendanceBySeriesInputGql })
    input: ListFinalizedAttendanceBySeriesInputGql,
  ): Promise<FinalizedAttendanceRecordGql[]> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listFinalizedAttendanceBySeriesUsecase.execute({
      session,
      seriesId: input.seriesId,
    });
    return result.items.map((item) => ({
      attendanceId: item.attendanceId,
      sessionId: item.sessionId,
      sessionStartTime: item.sessionStartTime,
      enrollmentId: item.enrollmentId,
      learnerId: item.learnerId,
      learnerName: item.learnerName,
      status: String(item.status),
      countApplied: item.countApplied,
      confirmedByCoachId: item.confirmedByCoachId,
      confirmedByCoachName: item.confirmedByCoachName,
      confirmedAt: item.confirmedAt,
      remark: item.remark,
    }));
  }

  /**
   * 查询节次已请假列表
   * @param user 当前登录用户的 JWT 载荷
   * @param sessionId 节次 ID
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => SessionLeaveRequestListGql, { name: 'listSessionLeaveRequests' })
  async listSessionLeaveRequests(
    @currentUser() user: JwtPayload,
    @Args('sessionId', { type: () => Int }) sessionId: number,
  ): Promise<SessionLeaveRequestListGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.listLeaveRequestsUsecase.execute({ session, sessionId });
    return {
      sessionId: result.sessionId,
      items: result.items.map((item) => ({
        enrollmentId: item.enrollmentId,
        learnerId: item.learnerId,
        learnerName: item.learnerName,
        reason: item.reason,
        confirmedAt: item.confirmedAt,
      })),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => RecordSessionAttendanceResultGql, { name: 'recordSessionAttendance' })
  async recordSessionAttendance(
    @currentUser() user: JwtPayload,
    @Args('input', { type: () => RecordSessionAttendanceInputGql })
    input: RecordSessionAttendanceInputGql,
  ): Promise<RecordSessionAttendanceResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.recordUsecase.execute(session, {
      sessionId: input.sessionId,
      items: input.items.map((it) => ({
        enrollmentId: it.enrollmentId,
        status: it.status,
        countApplied: it.countApplied,
        remark: it.remark ?? null,
      })),
    });
    return { updatedCount: result.updatedCount, unchangedCount: result.unchangedCount };
  }

  /**
   * 终审节次出勤
   * @param user 当前登录用户的 JWT 载荷
   * @param input 终审输入
   */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => FinalizeSessionAttendanceResultGql, { name: 'finalizeSessionAttendance' })
  async finalizeSessionAttendance(
    @currentUser() user: JwtPayload,
    @Args('input', { type: () => FinalizeSessionAttendanceInputGql })
    input: FinalizeSessionAttendanceInputGql,
  ): Promise<FinalizeSessionAttendanceResultGql> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.finalizeUsecase.execute(session, { sessionId: input.sessionId });
    return { updatedCount: result.updatedCount };
  }
}
