// src/modules/payout/session-adjustments/payout-session-adjustment.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SessionAdjustmentReasonType {
  PURCHASE = 'PURCHASE',
  GIFT = 'GIFT',
  COMPENSATION = 'COMPENSATION',
  CORRECTION = 'CORRECTION',
  INITIAL_IMPORT = 'INITIAL_IMPORT',
}

@Entity('payout_session_adjustments')
@Index('idx_payout_session_adj_customer_created_at', ['customerId', 'createdAt'])
@Index('idx_payout_session_adj_operator_created_at', ['operatorAccountId', 'createdAt'])
export class PayoutSessionAdjustmentEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({
    name: 'customer_id',
    type: 'int',
    nullable: false,
    comment: '引用 member_customers.id',
  })
  customerId!: number;

  @Column({
    name: 'delta_sessions',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: false,
    comment: '本次课次变动数，可正可负，精确到 0.01',
  })
  deltaSessions!: string;

  @Column({
    name: 'before_sessions',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: false,
    comment: '变动前剩余课次快照',
  })
  beforeSessions!: string;

  @Column({
    name: 'after_sessions',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: false,
    comment: '变动后剩余课次快照',
  })
  afterSessions!: string;

  @Column({ name: 'reason_type', type: 'enum', enum: SessionAdjustmentReasonType, nullable: false })
  reasonType!: SessionAdjustmentReasonType;

  @Column({ name: 'reason_note', type: 'varchar', length: 255, nullable: true })
  reasonNote!: string | null;

  @Column({ name: 'operator_account_id', type: 'int', nullable: true })
  operatorAccountId!: number | null;

  @Column({ name: 'order_ref', type: 'varchar', length: 64, nullable: true })
  orderRef!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', comment: '操作时间' })
  createdAt!: Date;
}
