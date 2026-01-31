// src/modules/participation-enrollment/participation-enrollment.entity.ts
import {
  ParticipationEnrollmentStatus,
  ParticipationEnrollmentStatusReason,
} from '@src/types/models/participation-enrollment.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 节次报名实体
 * 对应数据库表：participation_enrollment
 * Coach 点名依据（不计费；价格与结算在 series / session_coaches 处理）
 */
@Entity('participation_enrollment')
@Unique('uk_session_learner', ['sessionId', 'learnerId'])
@Index('idx_session', ['sessionId'])
@Index('idx_learner', ['learnerId'])
@Index('idx_customer', ['customerId'])
@Index('idx_session_status', ['sessionId', 'status'])
export class ParticipationEnrollmentEntity {
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

  /** 学员 ID（引用 member_learners.id，不建外键） */
  @Column({
    name: 'learner_id',
    type: 'int',
    nullable: false,
    comment: '引用 member_learners.id（不建外键）',
  })
  learnerId!: number;

  /** 客户 ID（冗余，便于查询与追溯） */
  @Column({
    name: 'customer_id',
    type: 'int',
    nullable: false,
    comment: '冗余字段，便于按客户查询与追溯',
  })
  customerId!: number;

  /** 报名状态（ENROLLED=有效预约；CANCELED=已取消；LEAVE=已请假） */
  @Column({
    name: 'status',
    type: 'enum',
    enum: ParticipationEnrollmentStatus,
    default: ParticipationEnrollmentStatus.ENROLLED,
    nullable: false,
    comment: '报名状态：ENROLLED=有效预约；CANCELED=已取消；LEAVE=已请假',
  })
  status!: ParticipationEnrollmentStatus;

  /** 状态变更时间（取消/请假等，可空） */
  @Column({
    name: 'status_changed_at',
    type: 'datetime',
    nullable: true,
    comment: '状态变更时间（取消/请假等）',
  })
  statusChangedAt!: Date | null;

  /** 状态变更操作者账号 ID（可空） */
  @Column({
    name: 'status_changed_by',
    type: 'int',
    nullable: true,
    comment: '状态变更操作者账号 ID（可空）',
  })
  statusChangedBy!: number | null;

  /** 状态变更原因（取消或请假，可空） */
  @Column({
    name: 'status_reason',
    type: 'enum',
    enum: ParticipationEnrollmentStatusReason,
    nullable: true,
    comment: '状态变更原因（取消或请假）',
  })
  statusReason!: ParticipationEnrollmentStatusReason | null;

  /** 备注 */
  @Column({ name: 'remark', type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark!: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '创建时间' })
  createdAt!: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', comment: '更新时间' })
  updatedAt!: Date;

  /** 创建者账号 ID */
  @Column({ name: 'created_by', type: 'int', nullable: true, comment: '创建者账号 ID' })
  createdBy!: number | null;

  /** 更新者账号 ID */
  @Column({ name: 'updated_by', type: 'int', nullable: true, comment: '更新者账号 ID' })
  updatedBy!: number | null;
}
