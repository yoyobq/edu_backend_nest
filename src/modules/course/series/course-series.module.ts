// src/modules/course/series/course-series.module.ts
import { CoachServiceModule } from '@modules/account/identities/training/coach/coach-service.module';
import { CustomerServiceModule } from '@modules/account/identities/training/customer/customer-service.module';
import { ManagerServiceModule } from '@modules/account/identities/training/manager/manager-service.module';
import { PaginationModule } from '@modules/common/pagination.module';
import { CourseCatalogsModule } from '@modules/course/catalogs/course-catalogs.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationEventsModule } from '@src/modules/common/integration-events/integration-events.module';
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
    CustomerServiceModule,
    ManagerServiceModule,
    IntegrationEventsModule,
  ],
  providers: [CourseSeriesService],
  exports: [TypeOrmModule, CourseSeriesService],
})
export class CourseSeriesModule {}
