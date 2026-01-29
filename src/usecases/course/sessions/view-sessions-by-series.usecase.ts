// src/usecases/course/sessions/view-sessions-by-series.usecase.ts
import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { CoachService } from '@src/modules/account/identities/training/coach/coach.service';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { CourseSeriesAccessPolicy } from '@src/usecases/course/sessions/course-series-access.policy';
import {
  ListSessionsBySeriesQuery,
  ListSessionsBySeriesUsecase,
} from '@src/usecases/course/sessions/list-sessions-by-series.usecase';

/**
 * 按开课班（ CourseSeries ）查看节次列表用例（带权限与可见性裁剪）
 *
 * - admin/manager：可访问任意 series
 * - coach：若与该 series 相关则可访问
 * - customer：仅可访问「可见」或「已报名」的 series
 */
@Injectable()
export class ViewSessionsBySeriesUsecase {
  constructor(
    private readonly listSessionsBySeriesUsecase: ListSessionsBySeriesUsecase,
    private readonly courseSeriesAccessPolicy: CourseSeriesAccessPolicy,
    private readonly coachService: CoachService,
  ) {}

  /**
   * 带权限与可见性裁剪地读取节次列表
   * @param session 用例会话
   * @param query 查询参数
   * @returns 节次实体列表
   */
  async execute(
    session: UsecaseSession,
    query: ListSessionsBySeriesQuery,
  ): Promise<CourseSessionEntity[]> {
    const isAdmin = hasRole(session.roles, IdentityTypeEnum.ADMIN);
    const isManager = hasRole(session.roles, IdentityTypeEnum.MANAGER);
    const isCustomer = hasRole(session.roles, IdentityTypeEnum.CUSTOMER);
    const isCoach = hasRole(session.roles, IdentityTypeEnum.COACH);

    if (isAdmin || isManager) {
      return await this.listSessionsBySeriesUsecase.execute(query);
    }

    if (!isCoach && !isCustomer) {
      throw new DomainError(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS, '缺少所需角色', {
        requiredRoles: [
          IdentityTypeEnum.ADMIN,
          IdentityTypeEnum.MANAGER,
          IdentityTypeEnum.CUSTOMER,
          IdentityTypeEnum.COACH,
        ],
        userRoles: session.roles,
      });
    }

    const canAccess = await this.courseSeriesAccessPolicy.canAccessSeriesSessions({
      session,
      seriesId: query.seriesId,
    });

    if (!canAccess) {
      return [];
    }

    return await this.listSessionsBySeriesUsecase.execute(query);
  }

  /**
   * 带权限与可见性裁剪地读取节次列表并补充主教练姓名（customer 安全视图）
   * @param session 用例会话
   * @param query 查询参数
   * @returns 节次实体与主教练姓名的列表
   */
  async executeWithLeadCoachName(
    session: UsecaseSession,
    query: ListSessionsBySeriesQuery,
  ): Promise<
    ReadonlyArray<{
      readonly session: CourseSessionEntity;
      readonly leadCoachName: string | null;
    }>
  > {
    const sessions = await this.execute(session, query);
    const nameMap = await this.loadLeadCoachNameMap(sessions);
    return sessions.map((item) => ({
      session: item,
      leadCoachName: nameMap.get(item.leadCoachId) ?? null,
    }));
  }

  /**
   * 批量加载主教练姓名映射
   * @param sessions 节次实体列表
   * @returns 教练 ID 到姓名的映射
   */
  private async loadLeadCoachNameMap(
    sessions: ReadonlyArray<CourseSessionEntity>,
  ): Promise<Map<number, string>> {
    if (sessions.length === 0) {
      return new Map<number, string>();
    }

    const coachIds = Array.from(new Set(sessions.map((item) => item.leadCoachId)));
    const coaches = await Promise.all(
      coachIds.map(async (coachId) => {
        const coach = await this.coachService.findById(coachId);
        return { coachId, name: coach?.name ?? null };
      }),
    );

    return coaches.reduce<Map<number, string>>((map, coach) => {
      if (coach.name) {
        map.set(coach.coachId, coach.name);
      }
      return map;
    }, new Map<number, string>());
  }
}
