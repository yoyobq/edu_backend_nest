// 文件位置：src/usecases/course/workflows/batch-record-attendance.usecase.ts
import {
  DomainError,
  ENROLLMENT_ERROR,
  PERMISSION_ERROR,
  SESSION_ERROR,
} from '@core/common/errors/domain-error';
import { buildEnvelope } from '@core/common/integration-events/events.types';
import { type IOutboxWriterPort } from '@core/common/integration-events/outbox.port';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { INTEGRATION_EVENTS_TOKENS } from '@src/modules/common/integration-events/events.tokens';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { ParticipationEnrollmentService } from '@src/modules/participation/enrollment/participation-enrollment.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { ParticipationAttendanceStatus } from '@src/types/models/attendance.types';
import { DataSource } from 'typeorm';

export interface BatchRecordItemInput {
  enrollmentId: number;
  status: ParticipationAttendanceStatus;
}

export interface BatchRecordAttendanceInput {
  sessionId: number;
  items: ReadonlyArray<BatchRecordItemInput>;
}

export interface BatchRecordAttendanceOutput {
  updatedCount: number;
  unchangedCount: number;
}

/**
 * 批量记录节次出勤 用例
 * 职责：
 * - 鉴权：manager / admin / leadCoach
 * - 校验：session 存在且状态允许；enrollment 属于该 session；未终审
 * - 写入：attendance.bulkUpsert（幂等），自动派生 countApplied 与确认留痕
 * - 事件：写入 AttendanceUpdated（批次级）
 * TODO：
 * - 扩展副教练参与权限
 * - 根据业务定义从 learner.countPerSession 派生 countApplied
 */
@Injectable()
export class BatchRecordAttendanceUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly enrollmentService: ParticipationEnrollmentService,
    private readonly attendanceService: ParticipationAttendanceService,
    @Inject(INTEGRATION_EVENTS_TOKENS.OUTBOX_WRITER_PORT)
    private readonly outboxWriter: IOutboxWriterPort,
  ) {}

  /**
   * 执行批量记录出勤
   * @param session 用例会话
   * @param input 批量输入
   * @returns 更新与未变更计数
   */
  async execute(
    session: UsecaseSession,
    input: BatchRecordAttendanceInput,
  ): Promise<BatchRecordAttendanceOutput> {
    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    this.ensurePermissions(session, s.leadCoachId);

    const finalized = await this.attendanceService.isFinalizedForSession(input.sessionId);
    if (finalized) {
      throw new DomainError(SESSION_ERROR.ATTENDANCE_NOT_FINALIZED, '该节次出勤已终审，不允许更新');
    }

    let updatedCount = 0;
    let unchangedCount = 0;
    await this.dataSource.transaction(async (_manager) => {
      for (const item of input.items) {
        const enr = await this.enrollmentService.findById(item.enrollmentId);
        if (!enr) throw new DomainError(ENROLLMENT_ERROR.ENROLLMENT_NOT_FOUND, '报名不存在');
        if (enr.sessionId !== input.sessionId) {
          throw new DomainError(ENROLLMENT_ERROR.OPERATION_NOT_ALLOWED, '报名不属于该节次');
        }

        // TODO: 根据业务规则派生 countApplied（例如来自 learner.countPerSession）
        const derivedCount = this.deriveCountApplied(item.status);

        // 幂等 upsert：若数据未变化则统计为 unchangedCount
        const before = await this.attendanceService.findByEnrollmentId(item.enrollmentId);
        const prevSig = before ? `${before.status}|${before.countApplied}` : null;

        await this.attendanceService.upsertByEnrollment({
          enrollmentId: item.enrollmentId,
          sessionId: input.sessionId,
          learnerId: enr.learnerId,
          countApplied: derivedCount,
          confirmedByCoachId: session.accountId,
          confirmedAt: new Date(),
          remark: before?.remark ?? null,
        });

        const after = await this.attendanceService.findByEnrollmentId(item.enrollmentId);
        const nextSig = after ? `${after.status}|${after.countApplied}` : null;
        if (prevSig === nextSig) unchangedCount++;
        else updatedCount++;
      }

      const envelope = buildEnvelope({
        type: 'AttendanceUpdated',
        aggregateType: 'session',
        aggregateId: input.sessionId,
        priority: 5,
        payload: { sessionId: input.sessionId, updatedCount, unchangedCount },
      });
      await this.outboxWriter.enqueue({ envelope });
    });

    return { updatedCount, unchangedCount };
  }

  /**
   * 权限校验：允许 admin / manager / 本节次 leadCoach
   * @param session 当前会话
   * @param leadCoachId 节次主教练 ID
   */
  private ensurePermissions(session: UsecaseSession, _leadCoachId: number): void {
    const roles = (session.roles ?? []).map((r) => String(r).toLowerCase());
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    if (isAdmin || isManager) return;
    if (!roles.includes('coach')) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权记录该节次出勤');
    }
    // TODO: 校验当前 coach 是否等于 leadCoachId（需要账户→教练 ID 映射）
  }

  /**
   * 根据出勤状态派生 countApplied 字符串
   * TODO：根据业务需要替换派生逻辑（例如读取 learner.countPerSession）
   */
  private deriveCountApplied(status: ParticipationAttendanceStatus): string {
    switch (status) {
      case ParticipationAttendanceStatus.PRESENT:
      case ParticipationAttendanceStatus.LATE_CANCEL:
        return '1.00';
      case ParticipationAttendanceStatus.NO_SHOW:
      case ParticipationAttendanceStatus.EXCUSED:
      case ParticipationAttendanceStatus.CANCELLED:
      default:
        return '0.00';
    }
  }
}
