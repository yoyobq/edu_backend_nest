// src/modules/course/sessions/course-sessions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerServiceModule } from '@src/modules/account/identities/training/customer/customer-service.module';
import { ParticipationEnrollmentModule } from '@src/modules/participation/enrollment/participation-enrollment.module';
import { ListSessionsBySeriesUsecase } from '@src/usecases/course/sessions/list-sessions-by-series.usecase';
import { CourseSessionEntity } from './course-session.entity';
import { CourseSessionsService } from './course-sessions.service';

/**
 * 课程节次模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CourseSessionEntity]),
    CustomerServiceModule,
    ParticipationEnrollmentModule,
  ],
  providers: [CourseSessionsService, ListSessionsBySeriesUsecase],
  exports: [TypeOrmModule, CourseSessionsService, ListSessionsBySeriesUsecase],
})
export class CourseSessionsModule {}
