// src/usecases/course/workflows/finalize-session-attendance.usecase.ts
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { ParticipationAttendanceService } from '@src/modules/participation/attendance/participation-attendance.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

export interface FinalizeSessionAttendanceInput {
  readonly sessionId: number;
}

export interface FinalizeSessionAttendanceOutput {
  readonly updatedCount: number;
}

/**
 * 节次出勤终审 用例
 * 职责：
 * - 鉴权：仅允许 admin / manager
 * - 校验：节次存在且未终审
 * - 写入：批量写入 finalizedAt 与 finalizedBy
 */
@Injectable()
export class FinalizeSessionAttendanceUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly attendanceService: ParticipationAttendanceService,
  ) {}

  /**
   * 执行节次出勤终审
   * @param session 用例会话
   * @param input 终审输入
   * @returns 更新条数
   */
  async execute(
    session: UsecaseSession,
    input: FinalizeSessionAttendanceInput,
  ): Promise<FinalizeSessionAttendanceOutput> {
    this.ensurePermissions(session);
    if (session.accountId == null) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '当前账户无法终审节次出勤');
    }
    const accountId = session.accountId;
    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');

    const finalized = await this.attendanceService.isFinalizedForSession(input.sessionId);
    if (finalized) {
      throw new DomainError(SESSION_ERROR.SESSION_LOCKED_FOR_ATTENDANCE, '该节次出勤已终审');
    }

    const updatedCount = await this.dataSource.transaction(async (manager) => {
      const affected = await this.attendanceService.lockForSession({
        sessionId: input.sessionId,
        finalizedBy: accountId,
        manager,
      });
      if (affected > 0) {
        await this.sessionsService.updateAttendance({
          id: input.sessionId,
          attendanceConfirmedAt: new Date(),
          attendanceConfirmedBy: accountId,
          manager,
        });
      }
      return affected;
    });

    return { updatedCount };
  }

  /**
   * 校验终审权限
   * @param session 用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const roles = (session.roles ?? []).map((r) => String(r).toLowerCase());
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    if (isAdmin || isManager) return;
    throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权终审该节次出勤');
  }
}
