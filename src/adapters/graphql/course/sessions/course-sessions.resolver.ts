// src/adapters/graphql/course/sessions/course-sessions.resolver.ts
import { mapJwtToUsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Roles } from '@src/adapters/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { UpdateSessionBasicInfoUsecase } from '@src/usecases/course/sessions/update-session-basic-info.usecase';
import { ViewSessionsBySeriesUsecase } from '@src/usecases/course/sessions/view-sessions-by-series.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import {
  CourseSessionDTO,
  CourseSessionSafeViewDTO,
  ExtraCoachDTO,
} from './dto/course-session.dto';
import { ListSessionsBySeriesInput } from './dto/list-sessions-by-series.input';
import {
  CourseSessionsBySeriesResult,
  CustomerCourseSessionsBySeriesResult,
} from './dto/list-sessions-by-series.result';
import { UpdateCourseSessionInput } from './dto/update-course-session.input';

function toCourseSessionDTO(entity: CourseSessionEntity): CourseSessionDTO {
  const dto = new CourseSessionDTO();
  dto.id = entity.id;
  dto.seriesId = entity.seriesId;
  dto.startTime = entity.startTime;
  dto.endTime = entity.endTime;
  dto.leadCoachId = entity.leadCoachId;
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
  dto.remark = entity.remark;
  dto.attendanceConfirmedAt = entity.attendanceConfirmedAt;
  dto.attendanceConfirmedBy = entity.attendanceConfirmedBy;
  dto.createdAt = entity.createdAt;
  dto.updatedAt = entity.updatedAt;
  return dto;
}

function toCourseSessionSafeViewDTO(entity: CourseSessionEntity): CourseSessionSafeViewDTO {
  const dto = new CourseSessionSafeViewDTO();
  dto.id = entity.id;
  dto.seriesId = entity.seriesId;
  dto.startTime = entity.startTime;
  dto.endTime = entity.endTime;
  dto.leadCoachId = entity.leadCoachId;
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

    const result = new CustomerCourseSessionsBySeriesResult();
    result.items = sessions.map((s) => toCourseSessionSafeViewDTO(s));
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
      leadCoachId: input.leadCoachId,
      remark: input.remark,
    });

    return toCourseSessionDTO(updated);
  }
}
