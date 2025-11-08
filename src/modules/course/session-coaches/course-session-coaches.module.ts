// src/modules/course-session-coaches/course-session-coaches.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSessionCoachEntity } from './course-session-coach.entity';
import { CourseSessionCoachesService } from './course-session-coaches.service';

/**
 * 节次-教练关联模块（结算权威）
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseSessionCoachEntity])],
  providers: [CourseSessionCoachesService],
  exports: [TypeOrmModule, CourseSessionCoachesService],
})
export class CourseSessionCoachesModule {}
