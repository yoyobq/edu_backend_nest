// src/modules/account/identities/training/coach/account-coach.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountEntity } from '../../../base/entities/account.entity';

@Entity('member_coaches')
export class CoachEntity {
  /**
   * 教练 ID，主键，自增
   */
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  /**
   * 关联的账户 ID
   */
  @Column({ name: 'account_id', type: 'int', unique: true })
  accountId!: number;

  /**
   * 关联的账户实体
   */
  @OneToOne(() => AccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  /**
   * 教练姓名
   */
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  /**
   * 教练等级：1/2/3
   */
  @Column({ type: 'tinyint', unsigned: true, default: 1, comment: '1/2/3' })
  level!: number;

  /**
   * 对外展示的简介/推介
   */
  @Column({ type: 'text', nullable: true, comment: '对外展示的简介/推介' })
  description!: string | null;

  /**
   * 教练头像
   */
  @Column({ name: 'avatar_url', type: 'varchar', length: 255, nullable: true, comment: '教练头像' })
  avatarUrl!: string | null;

  /**
   * 教练专长，如篮球/游泳/体能
   */
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '教练专长，如篮球/游泳/体能' })
  specialty!: string | null;

  /**
   * 内部备注，不对外展示
   */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '内部备注，不对外展示' })
  remark!: string | null;

  /**
   * 下线时间，NULL=有效；非 NULL=下线
   */
  @Column({
    name: 'deactivated_at',
    type: 'datetime',
    nullable: true,
    comment: 'NULL=有效；非 NULL=下线',
  })
  deactivatedAt!: Date | null;

  /**
   * 创建时间
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  /**
   * 更新时间
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  /**
   * 创建者 ID
   */
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;

  /**
   * 更新者 ID
   */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy!: number | null;
}
