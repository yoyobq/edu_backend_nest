// src/modules/course/series/course-series.module.ts
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { ManagerServiceModule } from '@modules/account/identities/training/manager/manager-service.module';
import { PaginationModule } from '@modules/common/pagination.module';
import { CourseCatalogsModule } from '@modules/course/catalogs/course-catalogs.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
import { CreateSeriesUsecase } from '@src/usecases/course/series/create-series.usecase';
import { DeleteSeriesUsecase } from '@src/usecases/course/series/delete-series.usecase';
import { GetSeriesUsecase } from '@src/usecases/course/series/get-series.usecase';
import { ListSeriesUsecase } from '@src/usecases/course/series/list-series.usecase';
import { SearchSeriesUsecase } from '@src/usecases/course/series/search-series.usecase';
import { UpdateSeriesUsecase } from '@src/usecases/course/series/update-series.usecase';
import { CourseSeriesEntity } from './course-series.entity';
import { CourseSeriesService } from './course-series.service';

/**
 * 课程系列模块
 * 仅提供领域内的读写服务与实体绑定，usecases 将编排业务逻辑
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CourseSeriesEntity]),
    PaginationModule,
    CourseCatalogsModule,
    CoachServiceModule,
    ManagerServiceModule,
    IntegrationEventsModule,
  ],
  providers: [
    CourseSeriesService,
    // CRUD 用例
    CreateSeriesUsecase,
    UpdateSeriesUsecase,
    DeleteSeriesUsecase,
    GetSeriesUsecase,
    ListSeriesUsecase,
    SearchSeriesUsecase,
  ],
  exports: [
    TypeOrmModule,
    CourseSeriesService,
    CreateSeriesUsecase,
    UpdateSeriesUsecase,
    DeleteSeriesUsecase,
    GetSeriesUsecase,
    ListSeriesUsecase,
    SearchSeriesUsecase,
  ],
})
export class CourseSeriesModule {}
