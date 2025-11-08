// src/modules/course-sessions/course-sessions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSessionEntity } from './course-session.entity';
import { CourseSessionsService } from './course-sessions.service';

/**
 * 课程节次模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSessionEntity])],
  providers: [CourseSessionsService],
  exports: [TypeOrmModule, CourseSessionsService],
})
export class CourseSessionsModule {}
