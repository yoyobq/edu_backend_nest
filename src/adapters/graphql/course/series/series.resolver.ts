// 文件位置：src/adapters/graphql/course/series/series.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import {
  CreateSeriesUsecase,
  type CreateSeriesOutput,
} from '@src/usecases/course/series/create-series.usecase';
import { PreviewSeriesScheduleUsecase } from '@src/usecases/course/series/preview-series-schedule.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CourseSeriesDTO } from './dto/course-series.dto';
import {
  CreateCourseSeriesDraftInput,
  PreviewSeriesScheduleInput,
} from './dto/course-series.input';
import { PreviewOccurrenceDTO, PreviewSeriesScheduleResultDTO } from './dto/course-series.result';

@Resolver(() => CourseSeriesDTO)
export class CourseSeriesResolver {
  constructor(
    private readonly createUsecase: CreateSeriesUsecase,
    private readonly previewUsecase: PreviewSeriesScheduleUsecase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Mutation(() => CourseSeriesDTO, {
    name: 'createCourseSeriesDraft',
    description: '创建课程系列草稿（仅 PLANNED）',
  })
  async createCourseSeriesDraft(
    @currentUser() user: JwtPayload,
    @Args('input') input: CreateCourseSeriesDraftInput,
  ): Promise<CourseSeriesDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const { series }: CreateSeriesOutput = await this.createUsecase.execute({ session, input });
    const dto = new CourseSeriesDTO();
    dto.id = series.id;
    dto.catalogId = series.catalogId;
    dto.title = series.title;
    dto.description = series.description;
    dto.venueType = series.venueType;
    dto.classMode = series.classMode;
    dto.startDate = series.startDate;
    dto.endDate = series.endDate;
    dto.recurrenceRule = series.recurrenceRule;
    dto.leaveCutoffHours = series.leaveCutoffHours;
    dto.pricePerSession = series.pricePerSession;
    dto.teachingFeeRef = series.teachingFeeRef;
    dto.maxLearners = series.maxLearners;
    dto.status = series.status;
    dto.remark = series.remark;
    dto.createdAt = series.createdAt;
    dto.updatedAt = series.updatedAt;
    dto.createdBy = series.createdBy;
    dto.updatedBy = series.updatedBy;
    return dto;
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => PreviewSeriesScheduleResultDTO, {
    name: 'previewCourseSeriesSchedule',
    description: '预览课程系列的排期（仅内存，不写 DB）',
  })
  async previewCourseSeriesSchedule(
    @currentUser() user: JwtPayload,
    @Args('input') input: PreviewSeriesScheduleInput,
  ): Promise<PreviewSeriesScheduleResultDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const { series, occurrences } = await this.previewUsecase.execute({
      session,
      seriesId: input.seriesId,
      options: { enableConflictCheck: input.enableConflictCheck ?? true },
    });

    // 映射 series 到 DTO（复用已定义字段）
    const seriesDto = new CourseSeriesDTO();
    seriesDto.id = series.id;
    seriesDto.catalogId = series.catalogId;
    seriesDto.title = series.title;
    seriesDto.description = series.description;
    seriesDto.venueType = series.venueType;
    seriesDto.classMode = series.classMode;
    seriesDto.startDate = series.startDate;
    seriesDto.endDate = series.endDate;
    seriesDto.recurrenceRule = series.recurrenceRule;
    seriesDto.leaveCutoffHours = series.leaveCutoffHours;
    seriesDto.pricePerSession = series.pricePerSession;
    seriesDto.teachingFeeRef = series.teachingFeeRef;
    seriesDto.maxLearners = series.maxLearners;
    seriesDto.status = series.status;
    seriesDto.remark = series.remark;
    seriesDto.createdAt = series.createdAt;
    seriesDto.updatedAt = series.updatedAt;
    seriesDto.createdBy = series.createdBy;
    seriesDto.updatedBy = series.updatedBy;

    const occDtos: PreviewOccurrenceDTO[] = occurrences.map((o) => {
      const dto = new PreviewOccurrenceDTO();
      dto.startDateTime = o.startDateTime;
      dto.endDateTime = o.endDateTime;
      dto.date = o.date;
      dto.weekdayIndex = o.weekdayIndex;
      dto.conflict = o.conflict
        ? { hasConflict: o.conflict.hasConflict, count: o.conflict.count }
        : null;
      return dto;
    });

    const result = new PreviewSeriesScheduleResultDTO();
    result.series = seriesDto;
    result.occurrences = occDtos;
    return result;
  }
}
