// src/adapters/graphql/course/sessions/course-sessions.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Roles } from '@src/adapters/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/graphql/guards/roles.guard';
import { CourseSessionEntity } from '@src/modules/course/sessions/course-session.entity';
import { ListSessionsBySeriesUsecase } from '@src/usecases/course/sessions/list-sessions-by-series.usecase';
import { CourseSessionDTO, ExtraCoachDTO } from './dto/course-session.dto';
import { ListSessionsBySeriesInput } from './dto/list-sessions-by-series.input';
import { CourseSessionsBySeriesResult } from './dto/list-sessions-by-series.result';

/**
 * 将节次实体映射为 GraphQL DTO
 * @param entity 节次实体
 * @returns GraphQL DTO
 */
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

/**
 * 课程节次查询 GraphQL Resolver
 * 仅做薄适配：权限在适配器层限制为 manager/admin
 */
@Resolver(() => CourseSessionDTO)
export class CourseSessionsResolver {
  constructor(private readonly listSessionsBySeriesUsecase: ListSessionsBySeriesUsecase) {}

  /**
   * 按开课班读取节次列表（近期窗口或全量）
   * @param input 查询参数
   * @returns 节次列表
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Query(() => CourseSessionsBySeriesResult, {
    name: 'courseSessionsBySeries',
    description: '按开课班读取节次列表（manager/admin）',
  })
  async courseSessionsBySeries(
    @Args('input') input: ListSessionsBySeriesInput,
  ): Promise<CourseSessionsBySeriesResult> {
    const mode = input.mode ?? 'RECENT_WINDOW';
    const sessions =
      mode === 'ALL'
        ? await this.listSessionsBySeriesUsecase.execute({
            mode: 'ALL',
            seriesId: input.seriesId,
            maxSessions: input.maxSessions ?? 200,
            statusFilter: input.statusFilter,
          })
        : await this.listSessionsBySeriesUsecase.execute({
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
}
