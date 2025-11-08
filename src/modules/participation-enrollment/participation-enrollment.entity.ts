// src/modules/participation-enrollment/participation-enrollment.entity.ts
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
@Index('idx_session_canceled', ['sessionId', 'isCanceled'])
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

  /** 是否取消（0=有效预约，1=已取消） */
  @Column({
    name: 'is_canceled',
    type: 'tinyint',
    width: 1,
    nullable: false,
    default: () => '0',
    comment: '是否取消（0=有效预约，1=已取消）',
  })
  isCanceled!: number;

  /** 取消时间（可空） */
  @Column({
    name: 'canceled_at',
    type: 'datetime',
    nullable: true,
    comment: '取消时间（可空）',
  })
  canceledAt!: Date | null;

  /** 取消操作者账号 ID（可空） */
  @Column({
    name: 'canceled_by',
    type: 'int',
    nullable: true,
    comment: '取消操作者账号 ID（可空）',
  })
  canceledBy!: number | null;

  /** 取消原因（可空） */
  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 120,
    nullable: true,
    comment: '取消原因（可空）',
  })
  cancelReason!: string | null;

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
