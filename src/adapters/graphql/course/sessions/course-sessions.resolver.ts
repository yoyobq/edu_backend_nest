// src/adapters/graphql/course/sessions/course-sessions.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { ClassMode, CourseSeriesStatus, VenueType } from '@app-types/models/course-series.types';
import { SessionCoachRemovedReason } from '@app-types/models/course-session-coach.types';
import type { SessionStatus } from '@app-types/models/course-session.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Roles } from '@src/adapters/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { AppendSessionCoachesUsecase } from '@src/usecases/course/sessions/append-session-coaches.usecase';
import { GenerateSessionCoachesForSeriesUsecase } from '@src/usecases/course/sessions/generate-session-coaches-for-series.usecase';
import { ListSessionCoachesBySeriesUsecase } from '@src/usecases/course/sessions/list-session-coaches-by-series.usecase';
import { ListSessionsByCoachUsecase } from '@src/usecases/course/sessions/list-sessions-by-coach.usecase';
import { RemoveSessionCoachesUsecase } from '@src/usecases/course/sessions/remove-session-coaches.usecase';
import { SyncSessionCoachesRosterUsecase } from '@src/usecases/course/sessions/sync-session-coaches-roster.usecase';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { CourseSeriesDTO } from '../series/dto/course-series.dto';
import { AppendSessionCoachesInputGql } from './dto/append-session-coaches.input';
import { AppendSessionCoachesResultGql } from './dto/append-session-coaches.result';
import {
  CourseSessionDTO,
  CourseSessionSafeViewDTO,
  CourseSessionWithSeriesDTO,
  ExtraCoachDTO,
} from './dto/course-session.dto';
import { GenerateSessionCoachesForSeriesInputGql } from './dto/generate-session-coaches.input';
import { GenerateSessionCoachesForSeriesResultGql } from './dto/generate-session-coaches.result';
import {
  ListSessionsByCoachInput,
  ListSessionsBySeriesInput,
} from './dto/list-sessions-by-series.input';
import {
  CoachCourseSessionsResult,
  CourseSessionsBySeriesResult,
  CustomerCourseSessionsBySeriesResult,
  SessionCoachBriefDTO,
  SessionCoachBySeriesItemDTO,
  SessionCoachesBySeriesResult,
} from './dto/list-sessions-by-series.result';
import { RemoveSessionCoachesInputGql } from './dto/remove-session-coaches.input';
import { RemoveSessionCoachesResultGql } from './dto/remove-session-coaches.result';
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

type CourseSeriesView = {
  readonly id: number;
  readonly catalogId: number;
  readonly title: string;
  readonly description: string | null;
  readonly venueType: VenueType;
  readonly classMode: ClassMode;
  readonly startDate: string;
  readonly endDate: string;
  readonly recurrenceRule: string | null;
  readonly leaveCutoffHours: number;
  readonly pricePerSession: string | null;
  readonly teachingFeeRef: string | null;
  readonly maxLearners: number;
  readonly status: CourseSeriesStatus;
  readonly remark: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: number | null;
  readonly updatedBy: number | null;
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
 * 将开课班实体映射为 DTO
 * @param entity 开课班实体
 * @returns 开课班 DTO
 */
function toCourseSeriesDTO(entity: CourseSeriesView): CourseSeriesDTO {
  const dto = new CourseSeriesDTO();
  dto.id = entity.id;
  dto.catalogId = entity.catalogId;
  dto.title = entity.title;
  dto.description = entity.description ?? null;
  dto.venueType = entity.venueType;
  dto.classMode = entity.classMode;
  dto.startDate = entity.startDate;
  dto.endDate = entity.endDate;
  dto.recurrenceRule = entity.recurrenceRule ?? null;
  dto.leaveCutoffHours = entity.leaveCutoffHours;
  dto.pricePerSession = entity.pricePerSession ?? null;
  dto.teachingFeeRef = entity.teachingFeeRef ?? null;
  dto.maxLearners = entity.maxLearners;
  dto.status = entity.status;
  dto.remark = entity.remark ?? null;
  dto.createdAt = entity.createdAt;
  dto.updatedAt = entity.updatedAt;
  dto.createdBy = entity.createdBy ?? null;
  dto.updatedBy = entity.updatedBy ?? null;
  return dto;
}

/**
 * 将节次与开课班信息映射为 DTO
 * @param params 组合对象
 * @returns 组合 DTO
 */
function toCourseSessionWithSeriesDTO(params: {
  readonly session: CourseSessionView;
  readonly series: CourseSeriesView | null;
}): CourseSessionWithSeriesDTO {
  const dto = new CourseSessionWithSeriesDTO();
  dto.session = toCourseSessionDTO(params.session);
  dto.series = params.series ? toCourseSeriesDTO(params.series) : null;
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
    private readonly listSessionsByCoachUsecase: ListSessionsByCoachUsecase,
    private readonly updateSessionBasicInfoUsecase: UpdateSessionBasicInfoUsecase,
    private readonly generateSessionCoachesForSeriesUsecase: GenerateSessionCoachesForSeriesUsecase,
    private readonly listSessionCoachesBySeriesUsecase: ListSessionCoachesBySeriesUsecase,
    private readonly appendSessionCoachesUsecase: AppendSessionCoachesUsecase,
    private readonly removeSessionCoachesUsecase: RemoveSessionCoachesUsecase,
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
  @Roles('COACH')
  @Query(() => CoachCourseSessionsResult, {
    name: 'listCoachSessions',
    description: '按教练读取关联节次列表（包含开课班信息）',
  })
  async listCoachSessions(
    @currentUser() user: JwtPayload,
    @Args('input', { nullable: true }) input?: ListSessionsByCoachInput,
  ): Promise<CoachCourseSessionsResult> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.listSessionsByCoachUsecase.execute({
      session,
      statusFilter: input?.statusFilter,
      maxSessions: input?.maxSessions,
    });

    const dto = new CoachCourseSessionsResult();
    dto.items = result.items.map((item) =>
      toCourseSessionWithSeriesDTO({
        session: item.session as CourseSessionView,
        series: item.series as CourseSeriesView | null,
      }),
    );
    return dto;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Query(() => SessionCoachesBySeriesResult, {
    name: 'listSessionCoachesBySeries',
    description: '按开课班读取节次教练列表（manager/admin，基于 roster 口径）',
  })
  async listSessionCoachesBySeries(
    @Args('input') input: ListSessionsBySeriesInput,
    @currentUser() user: JwtPayload,
  ): Promise<SessionCoachesBySeriesResult> {
    const mode = input.mode ?? 'RECENT_WINDOW';
    const session = mapJwtToUsecaseSession(user);
    const query =
      mode === 'ALL'
        ? {
            mode: 'ALL' as const,
            seriesId: input.seriesId,
            maxSessions: input.maxSessions ?? 200,
            statusFilter: input.statusFilter,
          }
        : {
            mode: 'RECENT_WINDOW' as const,
            seriesId: input.seriesId,
            baseTime: input.baseTime ?? new Date(),
            pastLimit: input.pastLimit ?? 2,
            futureLimit: input.futureLimit ?? 3,
            statusFilter: input.statusFilter,
          };
    const result = await this.listSessionCoachesBySeriesUsecase.execute({ session, query });
    const dto = new SessionCoachesBySeriesResult();
    dto.items = result.items.map((item) => {
      const itemDto = new SessionCoachBySeriesItemDTO();
      itemDto.sessionId = item.sessionId;
      itemDto.startTime = item.startTime;
      itemDto.endTime = item.endTime;
      itemDto.leadCoach = item.leadCoach ? this.toCoachBrief(item.leadCoach) : null;
      itemDto.assistantCoaches = item.assistantCoaches.map((coach) => this.toCoachBrief(coach));
      return itemDto;
    });
    return dto;
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
  @Mutation(() => AppendSessionCoachesResultGql, {
    name: 'appendSessionCoaches',
    description: '追加单节次教练 roster（不移除现有教练，manager/admin）',
  })
  async appendSessionCoaches(
    @Args('input') input: AppendSessionCoachesInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<AppendSessionCoachesResultGql> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.appendSessionCoachesUsecase.execute({
      session,
      sessionId: input.sessionId,
      coachIds: input.coachIds,
    });

    const dto = new AppendSessionCoachesResultGql();
    dto.sessionId = result.sessionId;
    dto.activatedCount = result.activatedCount;
    return dto;
  }

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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Mutation(() => RemoveSessionCoachesResultGql, {
    name: 'removeSessionCoaches',
    description: '移除单节次副教练（manager/admin）',
  })
  async removeSessionCoaches(
    @Args('input') input: RemoveSessionCoachesInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<RemoveSessionCoachesResultGql> {
    const session = mapJwtToUsecaseSession(user);
    const result = await this.removeSessionCoachesUsecase.execute({
      session,
      sessionId: input.sessionId,
      coachIds: input.coachIds,
    });

    const dto = new RemoveSessionCoachesResultGql();
    dto.sessionId = result.sessionId;
    dto.removedCount = result.removedCount;
    return dto;
  }

  private toCoachBrief(coach: {
    readonly id: number;
    readonly name: string;
    readonly level: number;
  }): SessionCoachBriefDTO {
    const dto = new SessionCoachBriefDTO();
    dto.id = coach.id;
    dto.name = coach.name;
    dto.level = coach.level;
    return dto;
  }
}
