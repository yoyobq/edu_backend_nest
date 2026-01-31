import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import type { UsecaseSession } from '@src/types/auth/session.types';
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';

export interface ListSessionEnrollmentsInput {
  readonly session: UsecaseSession;
  readonly sessionId: number;
}

export interface ListSessionEnrollmentsOutputItem {
  readonly id: number;
  readonly sessionId: number;
  readonly learnerId: number;
  readonly customerId: number;
  readonly status: ParticipationEnrollmentStatus;
  readonly statusReason: ParticipationEnrollmentStatusReason | null;
  readonly remark: string | null;
}

export interface ListSessionEnrollmentsOutput {
  readonly items: ListSessionEnrollmentsOutputItem[];
}

@Injectable()
export class ListSessionEnrollmentsUsecase {
  constructor(
    private readonly sessionsService: CourseSessionsService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly coachService: CoachService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 查询节次报名列表
   * @param input 会话与节次参数
   * @returns 报名明细列表
   */
  async execute(input: ListSessionEnrollmentsInput): Promise<ListSessionEnrollmentsOutput> {
    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    await this.ensurePermissions({
      session: input.session,
      sessionId: input.sessionId,
      leadCoachId: s.leadCoachId,
    });
    const enrollments = await this.enrollmentService.findBySession({ sessionId: input.sessionId });
    enrollments.sort((a, b) => {
      const c = a.createdAt.getTime() - b.createdAt.getTime();
      return c !== 0 ? c : a.id - b.id;
    });
    return {
      items: enrollments.map((e) => {
        return {
          id: e.id,
          sessionId: e.sessionId,
          learnerId: e.learnerId,
          customerId: e.customerId,
          status: e.status,
          statusReason: e.statusReason ?? null,
          remark: e.remark ?? null,
        };
      }),
    };
  }

  /**
   * 校验会话对节次报名的访问权限
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
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次报名');
    }
    const coach = await this.coachService.findByAccountId(session.accountId);
    if (!coach) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次报名');
    }
    if (coach.id === leadCoachId) return;
    const bound = await this.sessionCoachesService.findByUnique({ sessionId, coachId: coach.id });
    if (!bound) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权查看该节次报名');
    }
  }
}
