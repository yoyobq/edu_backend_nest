// src/modules/participation-attendance/participation-attendance-record.entity.ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParticipationAttendanceStatus } from '@app-types/models/attendance.types';

/**
 * 出勤记录实体（每节计入次数）
 * 对应数据库表：participation_attendance_record
 * 仅记录本节计入次数（count_applied）与确认留痕；不区分出勤口径。
 */
@Entity('participation_attendance_record')
@Index('uk_attend_session_learner', ['sessionId', 'learnerId'], { unique: true })
@Index('uk_attend_enrollment', ['enrollmentId'], { unique: true })
@Index('idx_attend_confirmed_coach', ['confirmedByCoachId'])
@Index('idx_attend_session', ['sessionId'])
@Index('idx_attend_session_status', ['sessionId', 'status'])
@Check('ck_attend_count_nonneg', 'count_applied >= 0')
@Check(
  'ck_attend_count_by_status',
  "(((`status` IN ('PRESENT','LATE_CANCEL','NO_SHOW') AND `count_applied` > 0) OR (`status` IN ('NO_SHOW_WAIVED','EXCUSED','CANCELLED') AND `count_applied` = 0)))",
)
export class ParticipationAttendanceRecordEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 节次 ID（引用 course_sessions.id，不建外键） */
  @Column({
    name: 'session_id',
    type: 'int',
    nullable: false,
    comment: '引用 course_sessions.id（不建外键）',
  })
  sessionId!: number;

  /** 报名 ID（对应 participation_enrollment.id，一对一） */
  @Column({
    name: 'enrollment_id',
    type: 'int',
    nullable: false,
    comment: '对应 participation_enrollment.id（一对一）',
  })
  enrollmentId!: number;

  /** 学员 ID（引用 member_learners.id，不建外键） */
  @Column({
    name: 'learner_id',
    type: 'int',
    nullable: false,
    comment: '引用 member_learners.id（不建外键）',
  })
  learnerId!: number;

  /** 计入次数（本节） */
  @Column({
    name: 'count_applied',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: '0.00',
    nullable: false,
    comment: '本节计入次数（可为 0.00；校验非负）',
  })
  countApplied!: string; // 使用字符串承载 decimal，避免 JS 精度问题

  @Column({
    name: 'status',
    type: 'enum',
    enum: ParticipationAttendanceStatus,
    default: ParticipationAttendanceStatus.NO_SHOW,
    nullable: false,
    comment:
      '出勤状态：PRESENT=出勤(>0)；NO_SHOW=未到计次(>0)；NO_SHOW_WAIVED=未到免计(0)；EXCUSED=请假(0)；LATE_CANCEL=迟退(>0)；CANCELLED=报名已撤销(0)',
  })
  status!: ParticipationAttendanceStatus;

  /** 最后一次点名的教练账号 ID */
  @Column({
    name: 'confirmed_by_coach_id',
    type: 'int',
    nullable: true,
    comment: '最后一次点名的教练账号 ID',
  })
  confirmedByCoachId!: number | null;

  /** 最后一次点名时间 */
  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true, comment: '最后一次点名时间' })
  confirmedAt!: Date | null;

  /** 人工终审人账号 ID（可空） */
  @Column({
    name: 'finalized_by',
    type: 'int',
    nullable: true,
    comment: '人工终审人账号 ID（可空）',
  })
  finalizedBy!: number | null;

  /** 人工终审时间（可空） */
  @Column({
    name: 'finalized_at',
    type: 'datetime',
    nullable: true,
    comment: '人工终审时间（可空）',
  })
  finalizedAt!: Date | null;

  /** 备注 */
  @Column({ name: 'remark', type: 'varchar', length: 255, nullable: true, comment: '备注（可空）' })
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
