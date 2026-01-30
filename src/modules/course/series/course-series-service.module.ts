// src/modules/course/series/course-series-service.module.ts

import { PaginationModule } from '@modules/common/pagination.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSeriesEntity } from './course-series.entity';
import { CourseSeriesService } from './course-series.service';

/**
 * Course Series Service 模块
 * 专门导出 CourseSeriesService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSeriesEntity]), PaginationModule],
  providers: [CourseSeriesService],
  exports: [CourseSeriesService],
})
export class CourseSeriesServiceModule {}
