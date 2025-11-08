// src/modules/course-session-coaches/course-session-coach.entity.ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 节次-教练关联实体（结算权威）
 * 对应数据库表：course_session_coaches
 * 记录每节给教练的授课费与奖金分配
 */
@Entity('course_session_coaches')
@Index('uk_session_coach_unique', ['sessionId', 'coachId'], { unique: true })
@Index('idx_session_lookup', ['sessionId'])
@Index('idx_coach_lookup', ['coachId', 'sessionId'])
@Index('idx_payout_coach_time', ['coachId', 'payoutFinalizedAt'])
@Index('idx_payout_finalized_at', ['payoutFinalizedAt'])
@Check('ck_sccoach_bonus_nonneg', 'bonus_amount >= 0')
@Check('ck_sccoach_teaching_fee_nonneg', 'teaching_fee_amount >= 0')
export class CourseSessionCoachEntity {
  /** 主键 ID */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /** 节次 ID（引用 course_sessions.id，不建外键） */
  @Column({ name: 'session_id', type: 'int', comment: 'course_sessions.id（不建外键）' })
  sessionId!: number;

  /** 教练 ID（引用 member_coach.id，不建外键） */
  @Column({ name: 'coach_id', type: 'int', comment: 'coaches.id（不建外键）' })
  coachId!: number;

  /** 授课费（金额） */
  @Column({
    name: 'teaching_fee_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: '0.00',
    comment: '本节该教练授课费（金额）',
  })
  teachingFeeAmount!: string; // 使用字符串承载 decimal，避免 JS 精度问题

  /** 奖金（金额） */
  @Column({
    name: 'bonus_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: '0.00',
    comment: '本节该教练奖金（金额）',
  })
  bonusAmount!: string; // 使用字符串承载 decimal，避免 JS 精度问题

  /** 分配备注 */
  @Column({
    name: 'payout_note',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '分配备注（可空）',
  })
  payoutNote!: string | null;

  /** 分配最终确定时间 */
  @Column({
    name: 'payout_finalized_at',
    type: 'datetime',
    nullable: true,
    comment: '该教练分配最终确定时间（可留痕对账）',
  })
  payoutFinalizedAt!: Date | null;

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
