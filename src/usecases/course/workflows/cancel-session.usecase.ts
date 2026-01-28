// src/usecases/course/workflows/cancel-session.usecase.ts
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { type UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

export interface CancelSessionInput {
  readonly sessionId: number;
}

export interface CancelSessionOutput {
  readonly sessionId: number;
  readonly status: SessionStatus;
}

@Injectable()
export class CancelSessionUsecase {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

  /**
   * 取消节次（标记为 CANCELED）
   * - 权限：仅 manager / admin
   * - 校验：节次存在；不可对 FINISHED 执行取消
   * - 幂等：若已为 CANCELED，则直接返回当前状态
   * @param session 当前用例会话
   * @param input 用例输入参数
   * @returns 更新后的节次状态
   */
  async execute(session: UsecaseSession, input: CancelSessionInput): Promise<CancelSessionOutput> {
    const roles = session.roles ?? [];
    const lowerRoles = roles.map((r) => String(r).toLowerCase());
    const isManager = lowerRoles.includes('manager');
    const isAdmin = lowerRoles.includes('admin');
    if (!isManager && !isAdmin) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '无权取消节次');
    }

    const s = await this.sessionsService.findById(input.sessionId);
    if (!s) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }

    if (s.status === SessionStatus.FINISHED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '已结课节次无法取消');
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      if (s.status !== SessionStatus.CANCELED) {
        const entity = await this.sessionsService.setStatus({
          id: s.id,
          status: SessionStatus.CANCELED,
          manager,
        });
        await this.sessionCoachesService.removeActiveBySession({
          sessionId: s.id,
          operatorAccountId: session.accountId ?? null,
          removedReason: SessionCoachRemovedReason.CANCELED,
          manager,
        });
        return entity;
      }
      await this.sessionCoachesService.removeActiveBySession({
        sessionId: s.id,
        operatorAccountId: session.accountId ?? null,
        removedReason: SessionCoachRemovedReason.CANCELED,
        manager,
      });
      return s;
    });

    return {
      sessionId: updated.id,
      status: updated.status,
    };
  }
}
