// src/modules/course/session-coaches/course-session-coaches-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSessionCoachEntity } from './course-session-coach.entity';
import { CourseSessionCoachesService } from './course-session-coaches.service';

/**
 * Course Session Coaches Service 模块
 * 专门导出 CourseSessionCoachesService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSessionCoachEntity])],
  providers: [CourseSessionCoachesService],
  exports: [CourseSessionCoachesService],
})
export class CourseSessionCoachesServiceModule {}
