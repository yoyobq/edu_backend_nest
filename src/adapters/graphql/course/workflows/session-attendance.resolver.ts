// 文件位置：src/adapters/graphql/course/workflows/session-attendance.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import { LoadSessionAttendanceSheetUsecase } from '@src/usecases/course/workflows/load-session-attendance-sheet.usecase';
import { BatchRecordAttendanceUsecase } from '@src/usecases/course/workflows/batch-record-attendance.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { AttendanceSheetGql, AttendanceSheetRowGql } from './dto/session-attendance.result';
import {
  RecordSessionAttendanceInputGql,
  RecordSessionAttendanceResultGql,
} from './dto/attendance.input';

/**
 * 节次点名视图 GraphQL Resolver
 * 适配器层：将 GraphQL 查询映射为 usecase 输入，并返回 usecase 输出。
 */
@Resolver(() => AttendanceSheetRowGql)
export class SessionAttendanceResolver {
  constructor(
    private readonly loadUsecase: LoadSessionAttendanceSheetUsecase,
    private readonly recordUsecase: BatchRecordAttendanceUsecase,
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
        status: String(r.status),
        countApplied: r.countApplied,
        confirmedByCoachId: r.confirmedByCoachId,
        confirmedAt: r.confirmedAt,
        finalized: r.finalized,
        isCanceled: r.isCanceled,
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
}
