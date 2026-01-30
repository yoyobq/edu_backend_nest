// 文件位置：src/usecases/course/workflows/list-session-leave-requests.usecase.ts
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { type UsecaseSession } from '@src/types/auth/session.types';

export type ListSessionLeaveRequestsInput = {
  readonly session: UsecaseSession;
  readonly sessionId: number;
};

export type ListSessionLeaveRequestsOutput = {
  readonly sessionId: number;
  readonly items: ReadonlyArray<{
    enrollmentId: number;
    learnerId: number;
    learnerName: string;
    reason: string | null;
    confirmedAt: Date | null;
  }>;
};

/**
 * 查询节次已请假列表 用例
 * 职责：
 * - 鉴权：允许 admin / manager / 本节次 leadCoach / coCoach 查看
 * - 读取：仅返回已请假的出勤行（EXCUSED）
 */
@Injectable()
export class ListSessionLeaveRequestsUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 执行查询
   * @param params 会话与节次 ID
   * @returns 已请假列表
   */
  async execute(params: ListSessionLeaveRequestsInput): Promise<ListSessionLeaveRequestsOutput> {
    const { session, sessionId } = params;
    const s = await this.sessionsService.findById(sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    await this.ensurePermissions({ session, sessionId, leadCoachId: s.leadCoachId });
    const items = await this.attendanceService.listExcusedRowsBySession({ sessionId });
    return { sessionId, items };
  }

  /**
   * 权限校验：允许 admin / manager / 本节次 leadCoach / coCoach 查看
   * @param params 会话与节次上下文
   */
  private async ensurePermissions(params: {
    readonly session: UsecaseSession;
    readonly sessionId: number;
    readonly leadCoachId: number;
  }): Promise<void> {
    const { session, sessionId, leadCoachId } = params;
    const roles = (session.roles ?? []).map((r) => String(r).toLowerCase());
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    if (isAdmin || isManager) return;
    if (!roles.includes('coach') || session.accountId == null) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次请假列表');
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次请假列表');
    }
    if (coach.id === leadCoachId) return;
    const bound = await this.sessionCoachesService.findByUnique({ sessionId, coachId: coach.id });
    if (!bound) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次请假列表');
    }
  }
}
