// src/modules/account/entities/account-staff.entity.ts
// import { Field, ID, ObjectType, Int } from '@nestjs/graphql';
import { EmploymentStatus } from '@app-types/models/account.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountEntity } from '../../../base/entities/account.entity';

@Entity('member_staff')
export class StaffEntity {
  /**
   * 员工 ID，主键
   */
  @PrimaryColumn({ type: 'varchar', length: 8 })
  id!: string;

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
   * 员工姓名
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  name!: string | null;

  /**
   * 部门 ID
   */
  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId!: number | null;

  /**
   * 备注信息
   */
  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  /**
   * 职位名称
   */
  @Column({ name: 'job_title', type: 'varchar', length: 50, nullable: true })
  jobTitle!: string | null;

  /**
   * 就业状态
   */
  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
    comment: '教职工状态：ACTIVE=在职，SUSPENDED=暂离（如休假、暂停教学），LEFT=已离职',
  })
  employmentStatus!: EmploymentStatus;

  /**
   * 创建时间
   */
  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  /**
   * 更新时间
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
