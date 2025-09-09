// src/modules/account/identities/training/manager/account-manager.entity.ts
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

@Entity('member_managers')
export class ManagerEntity {
  /**
   * 管理员 ID，主键，自增
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
   * 管理员姓名
   */
  @Column({ type: 'varchar', length: 64 })
  name!: string;

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

  /**
   * 备注，不对外
   */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注，不对外' })
  remark!: string | null;
}
