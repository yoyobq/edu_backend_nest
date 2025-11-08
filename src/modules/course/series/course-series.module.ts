// src/modules/course-series/course-series.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSeriesEntity } from './course-series.entity';
import { CourseSeriesService } from './course-series.service';

/**
 * 课程系列模块
 * 仅提供领域内的读写服务与实体绑定，usecases 将编排业务逻辑
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSeriesEntity])],
  providers: [CourseSeriesService],
  exports: [TypeOrmModule, CourseSeriesService],
})
export class CourseSeriesModule {}
