// src/modules/participation-enrollment/participation-enrollment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipationEnrollmentEntity } from './participation-enrollment.entity';
import { ParticipationEnrollmentService } from './participation-enrollment.service';

/**
 * 节次报名模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([ParticipationEnrollmentEntity])],
  providers: [ParticipationEnrollmentService],
  exports: [TypeOrmModule, ParticipationEnrollmentService],
})
export class ParticipationEnrollmentModule {}
