// src/modules/account/identities/training/learner/learner.entity.ts

import { Gender } from '@app-types/models/user-info.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountEntity } from '../../../base/entities/account.entity';
import { CustomerEntity } from '../customer/account-customer.entity';

/**
 * 学员实体
 * 对应数据库表：member_learners
 * 用于存储学员信息，隶属于客户（监护人）
 */
@Entity('member_learners')
export class LearnerEntity {
  /**
   * 学员 ID，主键
   * 自增整型主键
   */
  @PrimaryGeneratedColumn({ type: 'int', comment: '学员主键 ID' })
  id!: number;

  /**
   * 关联的账户 ID
   * 与 base_user_accounts 表的外键关联，可为空（他人子女）
   */
  @Column({
    name: 'account_id',
    type: 'int',
    nullable: true,
    comment: '参考 base_user_accounts.id；可空（他人子女）',
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
   * 所属客户 ID
   * 引用 member_customers.id，必填字段
   */
  @Column({
    name: 'customer_id',
    type: 'int',
    comment: '所属监护人/客户，引用 member_customers.id',
  })
  customerId!: number;

  /**
   * 关联的客户实体
   * 多对一关系，多个学员可以属于同一个客户
   */
  @ManyToOne(() => CustomerEntity, (customer) => customer.learners, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'customer_id' })
  customer!: CustomerEntity;

  /**
   * 学员姓名
   * 必填字段，最大长度 64 个字符
   */
  @Column({
    type: 'varchar',
    length: 64,
    comment: '学员姓名',
  })
  name!: string;

  /**
   * 性别
   * 枚举类型，MALE=男性，FEMALE=女性，SECRET=保密
   * 默认值为保密
   */
  @Column({
    type: 'enum',
    enum: Gender,
    default: Gender.SECRET,
    comment: '性别',
  })
  gender!: Gender;

  /**
   * 出生日期
   * 可为空，仅保留年月日
   */
  @Column({
    name: 'birth_date',
    type: 'date',
    nullable: true,
    comment: '出生日期，仅保留年月日',
  })
  birthDate!: string | null;

  /**
   * 头像 URL
   * 可为空，最大长度 255 个字符，存储头像或形象照的 URL
   */
  @Column({
    name: 'avatar_url',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '头像/形象照',
  })
  avatarUrl!: string | null;

  /**
   * 特殊需求
   * 可为空，最大长度 255 个字符，记录特殊需求或注意事项
   */
  @Column({
    name: 'special_needs',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '特殊需求/注意事项',
  })
  specialNeeds!: string | null;

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
   * 可为空，记录创建该学员记录的用户 ID
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
   * 可为空，记录最后更新该学员记录的用户 ID
   */
  @Column({
    name: 'updated_by',
    type: 'int',
    nullable: true,
    comment: '最后更新者用户 ID',
  })
  updatedBy!: number | null;
}
