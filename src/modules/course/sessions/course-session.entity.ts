// src/modules/course-sessions/course-session.entity.ts
import { SessionStatus, type ExtraCoachInfo } from '@app-types/models/course-session.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 课程节次实体
 * 对应数据库表：course_sessions
 * 记录具体的开课时间、地点与主教练信息
 */
@Entity('course_sessions')
@Index('uk_session_series_start', ['seriesId', 'startTime'], { unique: true })
@Index('idx_sessions_start', ['startTime'])
@Index('idx_sessions_lead_time', ['leadCoachId', 'startTime'])
@Index('idx_sessions_end', ['endTime'])
@Index('idx_sessions_attendance_confirmed_at', ['attendanceConfirmedAt'])
@Index('idx_sessions_status_start', ['status', 'startTime'])
@Index('idx_sessions_series_status_start', ['seriesId', 'status', 'startTime'])
@Index('idx_sessions_lead_status_start', ['leadCoachId', 'status', 'startTime'])
export class CourseSessionEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 系列 ID（引用 course_series.id，不建外键） */
  @Column({ name: 'series_id', type: 'int', comment: '引用 course_series.id（不建外键）' })
  seriesId!: number;

  /** 开始时间 */
  @Column({ name: 'start_time', type: 'datetime', comment: '开始时间' })
  startTime!: Date;

  /** 结束时间 */
  @Column({ name: 'end_time', type: 'datetime', comment: '结束时间' })
  endTime!: Date;

  /** 主教练 ID（冗余缓存） */
  @Column({ name: 'lead_coach_id', type: 'int', comment: '主教练（冗余缓存）' })
  leadCoachId!: number;

  /** 地点文本（自由文本） */
  @Column({
    name: 'location_text',
    type: 'varchar',
    length: 255,
    comment: '教室/地址；上门可写区域',
  })
  locationText!: string;

  /** 协助教练列表（JSON） */
  @Column({
    name: 'extra_coaches_json',
    type: 'json',
    nullable: true,
    comment: '协助教练列表',
  })
  extraCoachesJson!: ExtraCoachInfo[] | null;

  /** 节次状态 */
  @Column({
    name: 'status',
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.SCHEDULED,
    comment: '节次状态',
  })
  status!: SessionStatus;

  /** 请假阈值覆写（小时） */
  @Column({
    name: 'leave_cutoff_hours_override',
    type: 'int',
    nullable: true,
    comment: '预留：请假阈值覆写（小时）',
  })
  leaveCutoffHoursOverride!: number | null;

  /** 最后一次出勤确认时间 */
  @Column({
    name: 'attendance_confirmed_at',
    type: 'datetime',
    nullable: true,
    comment: '出勤确认时间',
  })
  attendanceConfirmedAt!: Date | null;

  /** 最后一次出勤确认人（账号 ID） */
  @Column({
    name: 'attendance_confirmed_by',
    type: 'int',
    nullable: true,
    comment: '出勤确认人账号 ID',
  })
  attendanceConfirmedBy!: number | null;

  /** 截止评估执行时间（预留） */
  @Column({
    name: 'cutoff_evaluated_at',
    type: 'datetime',
    nullable: true,
    comment: '预留：截止评估执行时间',
  })
  cutoffEvaluatedAt!: Date | null;

  /** 节次备注（仅信息） */
  @Column({ name: 'remark', type: 'varchar', length: 512, nullable: true, comment: '节次备注' })
  remark!: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '创建时间' })
  createdAt!: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '更新时间' })
  updatedAt!: Date;

  /** 创建者账号 ID */
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  /** 更新者账号 ID */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy!: number | null;
}
