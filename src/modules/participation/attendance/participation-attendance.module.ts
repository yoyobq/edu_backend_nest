// src/modules/participation-attendance/participation-attendance.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipationAttendanceRecordEntity } from './participation-attendance-record.entity';
import { ParticipationAttendanceService } from './participation-attendance.service';

/**
 * 出勤记录模块
 * 注册实体与服务，供 usecases 编排调用
 */
@Module({
  imports: [TypeOrmModule.forFeature([ParticipationAttendanceRecordEntity])],
  providers: [ParticipationAttendanceService],
  exports: [TypeOrmModule, ParticipationAttendanceService],
})
export class ParticipationAttendanceModule {}
