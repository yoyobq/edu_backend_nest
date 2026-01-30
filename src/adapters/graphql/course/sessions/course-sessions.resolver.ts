// src/adapters/graphql/course/sessions/course-sessions.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import type { SessionStatus } from '@app-types/models/course-session.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Roles } from '@src/adapters/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { GenerateSessionCoachesForSeriesUsecase } from '@src/usecases/course/sessions/generate-session-coaches-for-series.usecase';
import { SyncSessionCoachesRosterUsecase } from '@src/usecases/course/sessions/sync-session-coaches-roster.usecase';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import {
  CourseSessionDTO,
  CourseSessionSafeViewDTO,
  ExtraCoachDTO,
} from './dto/course-session.dto';
import { GenerateSessionCoachesForSeriesInputGql } from './dto/generate-session-coaches.input';
import { GenerateSessionCoachesForSeriesResultGql } from './dto/generate-session-coaches.result';
import { ListSessionsBySeriesInput } from './dto/list-sessions-by-series.input';
import {
  CourseSessionsBySeriesResult,
  CustomerCourseSessionsBySeriesResult,
} from './dto/list-sessions-by-series.result';
import { SyncSessionCoachesRosterInputGql } from './dto/sync-session-coaches-roster.input';
import { SyncSessionCoachesRosterResultGql } from './dto/sync-session-coaches-roster.result';
import { UpdateCourseSessionInput } from './dto/update-course-session.input';

type CourseSessionExtraCoachView = {
  readonly id: number;
  readonly name: string;
  readonly level: string;
};

type CourseSessionView = {
  readonly id: number;
  readonly seriesId: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly leadCoachId: number;
  readonly locationText: string;
  readonly leaveCutoffHoursOverride: number | null;
  readonly extraCoachesJson: ReadonlyArray<CourseSessionExtraCoachView> | null;
  readonly status: SessionStatus;
  readonly remark: string | null;
  readonly attendanceConfirmedAt: Date | null;
  readonly attendanceConfirmedBy: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function toCourseSessionDTO(entity: CourseSessionView): CourseSessionDTO {
  const dto = new CourseSessionDTO();
  dto.id = entity.id;
  dto.seriesId = entity.seriesId;
  dto.startTime = entity.startTime;
  dto.endTime = entity.endTime;
  dto.leadCoachId = entity.leadCoachId;
  dto.locationText = entity.locationText;
  dto.leaveCutoffHoursOverride = entity.leaveCutoffHoursOverride;
  dto.extraCoaches = entity.extraCoachesJson
    ? entity.extraCoachesJson.map((c) => {
        const coach = new ExtraCoachDTO();
        coach.id = c.id;
        coach.name = c.name;
        coach.level = c.level;
        return coach;
      })
    : null;
  dto.status = entity.status;
  dto.remark = entity.remark;
  dto.attendanceConfirmedAt = entity.attendanceConfirmedAt;
  dto.attendanceConfirmedBy = entity.attendanceConfirmedBy;
  dto.createdAt = entity.createdAt;
  dto.updatedAt = entity.updatedAt;
  return dto;
}

/**
 * 将节次实体映射为安全视图 DTO（补充主教练姓名）
 * @param entity 节次实体
 * @param leadCoachName 主教练姓名
 * @returns 安全视图 DTO
 */
function toCourseSessionSafeViewDTO(
  entity: CourseSessionView,
  leadCoachName: string | null,
): CourseSessionSafeViewDTO {
  const dto = new CourseSessionSafeViewDTO();
  dto.id = entity.id;
  dto.seriesId = entity.seriesId;
  dto.startTime = entity.startTime;
  dto.endTime = entity.endTime;
  dto.leadCoachId = entity.leadCoachId;
  dto.leadCoachName = leadCoachName;
  dto.locationText = entity.locationText;
  dto.extraCoaches = entity.extraCoachesJson
    ? entity.extraCoachesJson.map((c) => {
        const coach = new ExtraCoachDTO();
        coach.id = c.id;
        coach.name = c.name;
        coach.level = c.level;
        return coach;
      })
    : null;
  dto.status = entity.status;
  return dto;
}

/**
 * 课程节次查询 GraphQL Resolver
 * 仅做薄适配：
 * - courseSessionsBySeries：manager / admin
 * - customerCourseSessionsBySeries：customer 使用安全视图
 */
@Resolver()
export class CourseSessionsResolver {
  constructor(
    private readonly viewSessionsBySeriesUsecase: ViewSessionsBySeriesUsecase,
    private readonly updateSessionBasicInfoUsecase: UpdateSessionBasicInfoUsecase,
    private readonly generateSessionCoachesForSeriesUsecase: GenerateSessionCoachesForSeriesUsecase,
    private readonly syncSessionCoachesRosterUsecase: SyncSessionCoachesRosterUsecase,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Query(() => CourseSessionsBySeriesResult, {
    name: 'courseSessionsBySeries',
    description: '按开课班读取节次列表（manager/admin）',
  })
  async courseSessionsBySeries(
    @Args('input') input: ListSessionsBySeriesInput,
    @currentUser() user: JwtPayload,
  ): Promise<CourseSessionsBySeriesResult> {
    const mode = input.mode ?? 'RECENT_WINDOW';
    const session = mapJwtToUsecaseSession(user);
    const sessions =
      mode === 'ALL'
        ? await this.viewSessionsBySeriesUsecase.execute(session, {
            mode: 'ALL',
            seriesId: input.seriesId,
            maxSessions: input.maxSessions ?? 200,
            statusFilter: input.statusFilter,
          })
        : await this.viewSessionsBySeriesUsecase.execute(session, {
            mode: 'RECENT_WINDOW',
            seriesId: input.seriesId,
            baseTime: input.baseTime ?? new Date(),
            pastLimit: input.pastLimit ?? 2,
            futureLimit: input.futureLimit ?? 3,
            statusFilter: input.statusFilter,
          });

    const result = new CourseSessionsBySeriesResult();
    result.items = sessions.map((s) => toCourseSessionDTO(s));
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Query(() => CustomerCourseSessionsBySeriesResult, {
    name: 'customerCourseSessionsBySeries',
    description: '按开课班读取节次列表（安全视图）',
  })
  async customerCourseSessionsBySeries(
    @Args('input') input: ListSessionsBySeriesInput,
    @currentUser() user: JwtPayload,
  ): Promise<CustomerCourseSessionsBySeriesResult> {
    const mode = input.mode ?? 'RECENT_WINDOW';
    const session = mapJwtToUsecaseSession(user);
    const sessionItems =
      mode === 'ALL'
        ? await this.viewSessionsBySeriesUsecase.executeWithLeadCoachName(session, {
            mode: 'ALL',
            seriesId: input.seriesId,
            maxSessions: input.maxSessions ?? 200,
            statusFilter: input.statusFilter,
          })
        : await this.viewSessionsBySeriesUsecase.executeWithLeadCoachName(session, {
            mode: 'RECENT_WINDOW',
            seriesId: input.seriesId,
            baseTime: input.baseTime ?? new Date(),
            pastLimit: input.pastLimit ?? 2,
            futureLimit: input.futureLimit ?? 3,
            statusFilter: input.statusFilter,
          });

    const result = new CustomerCourseSessionsBySeriesResult();
    result.items = sessionItems.map((item) =>
      toCourseSessionSafeViewDTO(item.session, item.leadCoachName),
    );
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Mutation(() => CourseSessionDTO, {
    name: 'updateCourseSession',
    description: '更新课程节次基础信息（时间/地点/主教练/备注）',
  })
  async updateCourseSession(
    @Args('input') input: UpdateCourseSessionInput,
    @currentUser() user: JwtPayload,
  ): Promise<CourseSessionDTO> {
    const session = mapJwtToUsecaseSession(user);
    const updated = await this.updateSessionBasicInfoUsecase.execute(session, {
      sessionId: input.id,
      startTime: input.startTime,
      endTime: input.endTime,
      locationText: input.locationText,
      leaveCutoffHoursOverride: input.leaveCutoffHoursOverride,
      leadCoachId: input.leadCoachId,
      remark: input.remark,
    });

    return toCourseSessionDTO(updated);
  }

  /**
   * 按开课班批量生成节次教练关联的 GraphQL 接口
   * 仅做会话映射与入参透传，权限与业务规则由 Usecase 层负责
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Mutation(() => GenerateSessionCoachesForSeriesResultGql, {
    name: 'generateSessionCoachesForSeries',
    description: '按开课班批量生成节次-教练关联记录（manager/admin）',
  })
  async generateSessionCoachesForSeries(
    @Args('input') input: GenerateSessionCoachesForSeriesInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<GenerateSessionCoachesForSeriesResultGql> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.generateSessionCoachesForSeriesUsecase.execute({
      session,
      seriesId: input.seriesId,
      maxSessions: input.maxSessions,
    });
    const dto = new GenerateSessionCoachesForSeriesResultGql();
    dto.seriesId = result.seriesId;
    dto.sessionsProcessed = result.sessionsProcessed;
    dto.coachRelationsPlanned = result.coachRelationsPlanned;
    return dto;
  }

  /**
   * 同步单节次教练 roster 的 GraphQL 接口
   * 仅做会话映射与入参透传，权限与业务规则由 Usecase 层负责
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Mutation(() => SyncSessionCoachesRosterResultGql, {
    name: 'syncSessionCoachesRoster',
    description: '同步单节次教练 roster（整体覆盖，manager/admin）',
  })
  async syncSessionCoachesRoster(
    @Args('input') input: SyncSessionCoachesRosterInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<SyncSessionCoachesRosterResultGql> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.syncSessionCoachesRosterUsecase.execute({
      session,
      sessionId: input.sessionId,
      coachIds: input.coachIds,
      removedReason: SessionCoachRemovedReason.REPLACED,
    });

    const dto = new SyncSessionCoachesRosterResultGql();
    dto.sessionId = result.sessionId;
    dto.activatedCount = result.activatedCount;
    dto.removedCount = result.removedCount;
    return dto;
  }
}
