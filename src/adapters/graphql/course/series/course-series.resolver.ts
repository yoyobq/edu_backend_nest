// 文件位置：src/adapters/graphql/course/series/course-series.resolver.ts
import { ValidateInput } from '@core/common/errors/validate-input.decorator';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapGqlToCoreParams } from '@src/adapters/graphql/pagination.mapper';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import {
  CreateSeriesUsecase,
  type CreateSeriesOutput,
} from '@src/usecases/course/series/create-series.usecase';
import { PreviewSeriesScheduleUsecase } from '@src/usecases/course/series/preview-series-schedule.usecase';
import {
  PublishSeriesUsecase,
  type PublishSeriesOutput,
} from '@src/usecases/course/series/publish-series.usecase';
import { SearchSeriesUsecase } from '@src/usecases/course/series/search-series.usecase';
import { UpdateSeriesUsecase } from '@src/usecases/course/series/update-series.usecase';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { CourseSeriesEntity } from '@src/modules/course/series/course-series.entity';
import { currentUser } from '../../decorators/current-user.decorator';
import { Roles } from '../../decorators/roles.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { CourseSeriesDTO } from './dto/course-series.dto';
import {
  PaginatedCourseSeriesResultDTO,
  PreviewOccurrenceDTO,
  PreviewSeriesScheduleResultDTO,
  PublishSeriesResultDTO,
} from './dto/course-series.result';
import { CreateCourseSeriesDraftInput } from './dto/create-course-series-draft.input';
import { PreviewSeriesScheduleInput } from './dto/preview-series-schedule.input';
import { PublishCourseSeriesInput } from './dto/publish-course-series.input';
import { SearchCourseSeriesInputGql } from './dto/search-course-series.input';
import { UpdateCourseSeriesInput } from './dto/update-course-series.input';

@Resolver(() => CourseSeriesDTO)
export class CourseSeriesResolver {
  constructor(
    private readonly createUsecase: CreateSeriesUsecase,
    private readonly previewUsecase: PreviewSeriesScheduleUsecase,
    private readonly publishUsecase: PublishSeriesUsecase,
    private readonly searchUsecase: SearchSeriesUsecase,
    private readonly updateUsecase: UpdateSeriesUsecase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Mutation(() => CourseSeriesDTO, {
    name: 'createCourseSeriesDraft',
    description: '创建开课班草稿（仅 PLANNED）',
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.MANAGER, IdentityTypeEnum.COACH)
  @Mutation(() => CourseSeriesDTO, {
    name: 'updateCourseSeries',
    description: '更新开课班信息（仅允许更新特定字段）',
  })
  async updateCourseSeries(
    @currentUser() user: JwtPayload,
    @Args('input') input: UpdateCourseSeriesInput,
  ): Promise<CourseSeriesDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const { id, pricePerSession, teachingFeeRef, ...rest } = input;

    // 手动构造 Partial<CourseSeriesEntity>，处理类型转换
    const data: Partial<CourseSeriesEntity> = {
      ...rest,
    };

    if (pricePerSession !== undefined) {
      data.pricePerSession = pricePerSession === null ? null : pricePerSession.toFixed(2);
    }

    if (teachingFeeRef !== undefined) {
      data.teachingFeeRef = teachingFeeRef === null ? null : teachingFeeRef.toFixed(2);
    }

    const series = await this.updateUsecase.execute({
      session,
      id,
      data,
    });

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
    description: '预览开课班的排期（仅内存，不写 DB）',
  })
  async previewCourseSeriesSchedule(
    @currentUser() user: JwtPayload,
    @Args('input') input: PreviewSeriesScheduleInput,
  ): Promise<PreviewSeriesScheduleResultDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const { series, occurrences, previewHash, defaultLeadCoachId } =
      await this.previewUsecase.execute({
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
      dto.occurrenceKey = o.occurrenceKey;
      dto.conflict = o.conflict
        ? { hasConflict: o.conflict.hasConflict, count: o.conflict.count }
        : null;
      return dto;
    });

    const result = new PreviewSeriesScheduleResultDTO();
    result.series = seriesDto;
    result.occurrences = occDtos;
    result.previewHash = previewHash;
    result.defaultLeadCoachId = defaultLeadCoachId;
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ValidateInput()
  @Query(() => PaginatedCourseSeriesResultDTO, {
    name: 'searchCourseSeries',
    description: '搜索与分页开课班',
  })
  async searchCourseSeries(
    @Args('input') input: SearchCourseSeriesInputGql,
    @currentUser() user: JwtPayload,
  ): Promise<PaginatedCourseSeriesResultDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const pagination = mapGqlToCoreParams({ ...input.pagination, sorts: input.sorts });

    const res = await this.searchUsecase.execute({
      session,
      params: {
        query: input.query,
        filters: {
          ...(typeof input.activeOnly === 'boolean' ? { activeOnly: input.activeOnly } : {}),
          ...(Array.isArray(input.statuses) && input.statuses.length > 0
            ? { statuses: input.statuses }
            : {}),
          ...(typeof input.classMode === 'string' ? { classMode: input.classMode } : {}),
          ...(typeof input.startDateFrom === 'string'
            ? { startDateFrom: input.startDateFrom }
            : {}),
          ...(typeof input.startDateTo === 'string' ? { startDateTo: input.startDateTo } : {}),
          ...(typeof input.endDateFrom === 'string' ? { endDateFrom: input.endDateFrom } : {}),
          ...(typeof input.endDateTo === 'string' ? { endDateTo: input.endDateTo } : {}),
        },
        pagination,
      },
    });

    const output = new PaginatedCourseSeriesResultDTO();
    output.items = res.items.map((series) => {
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
    });
    output.total = res.total;
    output.page = res.page;
    output.pageSize = res.pageSize;
    output.pageInfo = res.pageInfo
      ? { hasNext: res.pageInfo.hasNext ?? false, nextCursor: res.pageInfo.nextCursor }
      : undefined;
    return output;
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => PublishSeriesResultDTO, {
    name: 'publishCourseSeries',
    description: '发布开课班（支持 dryRun 试发布，不写库）',
  })
  async publishCourseSeries(
    @currentUser() user: JwtPayload,
    @Args('input') input: PublishCourseSeriesInput,
  ): Promise<PublishSeriesResultDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result: PublishSeriesOutput = await this.publishUsecase.execute({
      session,
      seriesId: input.seriesId,
      selectedKeys: input.selectedKeys,
      previewHash: input.previewHash,
      dryRun: input.dryRun,
      customSessions: input.customSessions?.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        locationText: s.locationText,
        remark: s.remark ?? null,
      })),
      leadCoachId: input.leadCoachId,
    });
    const dto = new PublishSeriesResultDTO();
    dto.seriesId = result.series.id;
    dto.status = result.series.status;
    dto.publishedAt = result.series.publishedAt ?? null;
    dto.createdSessions = result.createdSessions;
    return dto;
  }
}
