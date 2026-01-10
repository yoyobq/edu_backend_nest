// src/usecases/course/sessions/update-session-basic-info.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { UsecaseSession } from '@src/types/auth/session.types';

export interface UpdateSessionBasicInfoInput {
  readonly sessionId: number;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly locationText?: string | null;
  readonly leadCoachId?: number | null;
  readonly remark?: string | null;
}

@Injectable()
export class UpdateSessionBasicInfoUsecase {
  constructor(private readonly sessionsService: CourseSessionsService) {}

  /**
   * 更新节次基础信息
   * @param session 当前用例会话
   * @param input 更新输入参数
   * @returns 更新后的节次实体
   */
  async execute(
    session: UsecaseSession,
    input: UpdateSessionBasicInfoInput,
  ): Promise<CourseSessionEntity> {
    this.ensurePermissions(session);

    const current = await this.sessionsService.findById(input.sessionId);
    if (!current) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }

    if (current.status === SessionStatus.FINISHED || current.status === SessionStatus.CANCELED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前状态不允许修改节次');
    }

    if (input.leadCoachId === null) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '主教练 ID 不允许为空');
    }

    const nextStart = input.startTime ?? current.startTime;
    const nextEnd = input.endTime ?? current.endTime;
    this.ensureTimeRangeValid(nextStart, nextEnd);

    const patch: Partial<
      Pick<CourseSessionEntity, 'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'remark'>
    > = {};

    if (input.startTime !== undefined) {
      patch.startTime = input.startTime;
    }
    if (input.endTime !== undefined) {
      patch.endTime = input.endTime;
    }
    if (input.leadCoachId !== undefined) {
      patch.leadCoachId = input.leadCoachId;
    }
    if (input.locationText !== undefined) {
      patch.locationText = input.locationText ?? '';
    }
    if (input.remark !== undefined) {
      patch.remark = input.remark ?? null;
    }

    if (Object.keys(patch).length === 0) {
      return current;
    }

    return await this.sessionsService.update(current.id, patch);
  }

  /**
   * 校验当前用户是否有权更新节次基础信息
   * @param session 当前用例会话
   */
  private ensurePermissions(session: UsecaseSession): void {
    const allowed =
      hasRole(session.roles, IdentityTypeEnum.MANAGER) ||
      hasRole(session.roles, IdentityTypeEnum.ADMIN);
    if (!allowed) {
      throw new DomainError(
        PERMISSION_ERROR.ACCESS_DENIED,
        '仅 manager / admin 可以更新节次基础信息',
      );
    }
  }

  /**
   * 校验时间区间合法性
   * @param start 开始时间
   * @param end 结束时间
   */
  private ensureTimeRangeValid(start: Date, end: Date): void {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '开始时间无效');
    }
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '结束时间无效');
    }
    if (start.getTime() >= end.getTime()) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '开始时间必须早于结束时间');
    }
  }

  /**
   * 时间区间校验
   */
}
