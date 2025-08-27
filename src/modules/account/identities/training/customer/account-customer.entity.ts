// src/modules/account/identities/training/customer/customer.entity.ts

import { MembershipLevel } from '@app-types/models/training.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountEntity } from '../../../base/entities/account.entity';
import { LearnerEntity } from '../learner/account-learner.entity';

/**
 * 客户实体
 * 对应数据库表：member_customers
 * 用于存储付款人/监护人/客户信息，包含会员等级管理
 */
@Entity('member_customers')
export class CustomerEntity {
  /**
   * 客户 ID，主键
   * 自增整型主键
   */
  @PrimaryGeneratedColumn({ type: 'int', comment: '客户主键 ID' })
  id!: number;

  /**
   * 关联的账户 ID
   * 与 base_user_accounts 表的外键关联，可为空（线下客户）
   */
  @Column({
    name: 'account_id',
    type: 'int',
    nullable: true,
    unique: true,
    comment: '参考 base_user_accounts.id；可空=线下客户',
  })
  accountId!: number | null;

  /**
   * 关联的账户实体
   * 一对一关系，通过 account_id 字段关联，可为空
   */
  @OneToOne(() => AccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  /**
   * 客户姓名
   * 必填字段，最大长度 64 个字符
   */
  @Column({
    type: 'varchar',
    length: 64,
    comment: '客户姓名',
  })
  name!: string;

  /**
   * 备用联系电话
   * 可为空，最大长度 20 个字符，用于备用联系方式
   */
  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '备用联系电话',
  })
  contactPhone!: string | null;

  /**
   * 联络偏好时间
   * 可为空，最大长度 50 个字符，例如：晚上/周末
   */
  @Column({
    name: 'preferred_contact_time',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '联络偏好，例：晚上/周末',
  })
  preferredContactTime!: string | null;

  /**
   * 会员等级
   * 枚举类型，1=普通，2=VIP，3=黄金，4=白金，5=钻石
   * 默认值为普通会员
   */
  @Column({
    name: 'membership_level',
    type: 'int',
    default: MembershipLevel.NORMAL,
    comment: '会员等级,1=普通，2=VIP，3=黄金，4=白金，5=钻石',
  })
  membershipLevel!: MembershipLevel;

  /**
   * 内部备注
   * 可为空，最大长度 255 个字符，用于内部管理备注
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '内部备注',
  })
  remark!: string | null;

  /**
   * 停用时间
   * 可为空，NULL=有效；非 NULL=已下线
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
   * 自动设置为当前时间戳
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
  })
  createdAt!: Date;

  /**
   * 更新时间
   * 自动更新为当前时间戳
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    comment: '更新时间',
  })
  updatedAt!: Date;

  /**
   * 创建者 ID
   * 可为空，记录创建该客户记录的用户 ID
   */
  @Column({
    name: 'created_by',
    type: 'int',
    nullable: true,
    comment: '创建者用户 ID',
  })
  createdBy!: number | null;

  /**
   * 更新者 ID
   * 可为空，记录最后更新该客户记录的用户 ID
   */
  @Column({
    name: 'updated_by',
    type: 'int',
    nullable: true,
    comment: '最后更新者用户 ID',
  })
  updatedBy!: number | null;

  /**
   * 关联的学员列表
   * 一对多关系，一个客户可以有多个学员（如子女）
   */
  @OneToMany(() => LearnerEntity, (learner) => learner.customer)
  learners?: LearnerEntity[];
}
