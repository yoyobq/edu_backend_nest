// src/modules/course/sessions/course-sessions-service.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSessionEntity } from './course-session.entity';
import { CourseSessionsService } from './course-sessions.service';

/**
 * Course Sessions Service 模块
 * 专门导出 CourseSessionsService 供 usecases 使用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSessionEntity])],
  providers: [CourseSessionsService],
  exports: [CourseSessionsService],
})
export class CourseSessionsServiceModule {}
