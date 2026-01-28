// src/usecases/course/sessions/update-session-basic-info.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import { SessionStatus } from '@app-types/models/course-session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR, SESSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CourseSessionCoachesService } from '@src/modules/course/session-coaches/course-session-coaches.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSessionsService } from '@src/modules/course/sessions/course-sessions.service';
import { UsecaseSession } from '@src/types/auth/session.types';
import { DataSource } from 'typeorm';

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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessionsService: CourseSessionsService,
    private readonly sessionCoachesService: CourseSessionCoachesService,
  ) {}

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
    const current = await this.loadSessionOrThrow(input.sessionId);
    this.ensureStatusEditable(current);
    this.ensureLeadCoachIdValid(input);
    this.ensureTimeRangeValid(
      input.startTime ?? current.startTime,
      input.endTime ?? current.endTime,
    );

    const patch = this.buildPatch(input);
    if (!this.hasPatch(patch)) {
      return current;
    }

    const leadCoachChanged = this.isLeadCoachChanged(input, current);
    if (!leadCoachChanged) {
      return await this.sessionsService.update(current.id, patch);
    }

    return await this.updateWithLeadCoachChange({
      current,
      patch,
      nextLeadCoachId: this.getNextLeadCoachId(input.leadCoachId),
      operatorAccountId: session.accountId ?? null,
    });
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
  /**
   * 加载节次并校验存在性
   * @param sessionId 节次 ID
   */
  private async loadSessionOrThrow(sessionId: number): Promise<CourseSessionEntity> {
    const current = await this.sessionsService.findById(sessionId);
    if (!current) {
      throw new DomainError(SESSION_ERROR.SESSION_NOT_FOUND, '节次不存在');
    }
    return current;
  }

  /**
   * 校验节次状态是否允许更新
   * @param current 当前节次实体
   */
  private ensureStatusEditable(current: CourseSessionEntity): void {
    if (current.status === SessionStatus.FINISHED || current.status === SessionStatus.CANCELED) {
      throw new DomainError(SESSION_ERROR.SESSION_STATUS_INVALID, '当前状态不允许修改节次');
    }
  }

  /**
   * 校验主教练 ID 是否非法
   * @param input 用例输入
   */
  private ensureLeadCoachIdValid(input: UpdateSessionBasicInfoInput): void {
    if (input.leadCoachId === null) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '主教练 ID 不允许为空');
    }
  }

  /**
   * 解析更新后的主教练 ID
   * @param leadCoachId 主教练 ID
   */
  private getNextLeadCoachId(leadCoachId: number | null | undefined): number {
    if (leadCoachId === undefined || leadCoachId === null) {
      throw new DomainError(SESSION_ERROR.INVALID_PARAMS, '主教练 ID 不允许为空');
    }
    return leadCoachId;
  }

  /**
   * 构造节次更新 Patch
   * @param input 用例输入
   */
  private buildPatch(
    input: UpdateSessionBasicInfoInput,
  ): Partial<
    Pick<CourseSessionEntity, 'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'remark'>
  > {
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
    return patch;
  }

  /**
   * 判断 Patch 是否为空
   * @param patch 更新 Patch
   */
  private hasPatch(
    patch: Partial<
      Pick<CourseSessionEntity, 'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'remark'>
    >,
  ): boolean {
    return Object.keys(patch).length > 0;
  }

  /**
   * 判断主教练是否发生变化
   * @param input 用例输入
   * @param current 当前节次实体
   */
  private isLeadCoachChanged(
    input: UpdateSessionBasicInfoInput,
    current: CourseSessionEntity,
  ): boolean {
    return input.leadCoachId !== undefined && input.leadCoachId !== current.leadCoachId;
  }

  /**
   * 事务内更新节次并同步主教练 roster
   * @param params 更新参数
   */
  private async updateWithLeadCoachChange(params: {
    readonly current: CourseSessionEntity;
    readonly patch: Partial<
      Pick<CourseSessionEntity, 'startTime' | 'endTime' | 'leadCoachId' | 'locationText' | 'remark'>
    >;
    readonly nextLeadCoachId: number;
    readonly operatorAccountId: number | null;
  }): Promise<CourseSessionEntity> {
    const { current, patch, nextLeadCoachId, operatorAccountId } = params;
    const previousLeadCoachId = current.leadCoachId;
    const updated = await this.dataSource.transaction(async (manager) => {
      const entity = await this.sessionsService.updateWithManager({
        id: current.id,
        patch,
        manager,
      });

      await this.sessionCoachesService.ensureActive({
        sessionId: current.id,
        coachId: nextLeadCoachId,
        operatorAccountId,
        manager,
      });

      if (previousLeadCoachId && previousLeadCoachId !== nextLeadCoachId) {
        await this.sessionCoachesService.removeFromRoster({
          sessionId: current.id,
          coachId: previousLeadCoachId,
          operatorAccountId,
          removedReason: SessionCoachRemovedReason.REPLACED,
          manager,
        });
      }

      return entity;
    });
    return updated;
  }
}
