// 文件位置：src/adapters/graphql/course/series/series.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@src/types/auth/session.types';
import { JwtPayload } from '@src/types/jwt.types';
import {
  CreateSeriesUsecase,
  type CreateSeriesOutput,
} from '@src/usecases/course/series/create-series.usecase';
import { currentUser } from '../../decorators/current-user.decorator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CourseSeriesDTO, CreateSeriesInputGql } from './dto/series.types';

@Resolver(() => CourseSeriesDTO)
export class CourseSeriesResolver {
  constructor(private readonly createUsecase: CreateSeriesUsecase) {}

  @UseGuards(JwtAuthGuard)
  @Mutation(() => CourseSeriesDTO, {
    name: 'createCourseSeriesDraft',
    description: '创建课程系列草稿（仅 PLANNED）',
  })
  async createCourseSeriesDraft(
    @currentUser() user: JwtPayload,
    @Args('input') input: CreateSeriesInputGql,
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
}
