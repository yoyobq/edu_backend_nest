// src/usecases/course/workflows/close-session.usecase.ts
import { SessionStatus } from '@app-types/models/course-session.types';
import {
  DomainError,
  PAYOUT_RULE_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { PayoutSeriesRuleService } from '@src/modules/course/payout-series-rule/payout-series-rule.service';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

export interface CloseSessionInput {
  readonly sessionId: number;
}

export interface CloseSessionOutput {
  readonly sessionId: number;
  readonly status: SessionStatus;
}

@Injectable()
export class CloseSessionUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly attendanceService: ParticipationAttendanceService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
    private readonly payoutRuleService: PayoutSeriesRuleService,
    private readonly coachService: CoachService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 关闭节次（结课）
   * - 鉴权：manager / leadCoach
   * - 校验：session 存在且非 FINISHED/CANCELED；出勤已定稿
   * - 事务：markCompleted → lockForSession → freezeSessionTemplate(按现有设计即“确保 session_coaches 作为快照存在”) → outbox
   */
  async execute(session: UsecaseSession, input: CloseSessionInput): Promise<CloseSessionOutput> {
    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');

    // 鉴权：允许 manager / admin / leadCoach
    const isManager = session.roles?.some((r) => r.toLowerCase() === 'manager') ?? false;
    const isAdmin = session.roles?.some((r) => r.toLowerCase() === 'admin') ?? false;
    if (!isManager && !isAdmin) {
      const coach = await this.coachService.findByAccountId(session.accountId);
      const isLeadCoach = !!coach && coach.id === s.leadCoachId;
      if (!isLeadCoach) {
        throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权结课');
      }
    }

    if (s.status === SessionStatus.CANCELED || s.status === SessionStatus.FINISHED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前状态不允许结课');
    }

    const isFinal = await this.attendanceService.isFinalizedForSession(s.id);
    if (!isFinal) {
      throw new DomainError(SESSION_ERROR.ATTENDANCE_NOT_FINALIZED, '出勤尚未定稿，无法结课');
    }

    // 事务：markCompleted → lockForSession → freezeSessionTemplate(校验存在性) → outbox
    await this.dataSource.transaction(async (manager) => {
      const ok = await this.sessionsService.markCompleted({ id: s.id, manager });
      if (!ok) {
        throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '状态不允许结课');
      }

      await this.attendanceService.lockForSession({
        sessionId: s.id,
        finalizedBy: session.accountId,
        manager,
      });

      // 冻结模板副本最小化：校验该节的结算模板是否存在（session_coaches 至少一条）
      const count = await this.sessionCoachesService.countBySession({ sessionId: s.id, manager });
      if (count === 0) {
        // 尝试检查系列规则是否存在，若不存在则抛错
        const ps = await this.payoutRuleService.findBySeriesId(s.seriesId, { manager });
        if (!ps) throw new DomainError(PAYOUT_RULE_ERROR.PAYOUT_RULE_MISSING, '缺少课酬规则或模板');
        // 若你期望此处自动从系列规则生成默认模板，可在此扩展；当前保持最小改造，仅抛错提示补齐模板
        throw new DomainError(PAYOUT_RULE_ERROR.PAYOUT_RULE_MISSING, '本节未配置教练结算模板');
      }

      const envelope = buildEnvelope({
        type: 'SessionClosed',
        aggregateType: 'session',
        aggregateId: s.id,
        payload: { sessionId: s.id, seriesId: s.seriesId },
        priority: 5,
      });
      await this.outboxWriter.enqueue({ tx: { kind: 'tx' }, envelope });
    });

    return { sessionId: s.id, status: SessionStatus.FINISHED };
  }
}
