// import { Field, ID, ObjectType, Int } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentStatus } from '../../../types/models/staff.types';
import { AccountEntity } from './account.entity';

@Entity('member_staff')
export class StaffEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'account_id', type: 'int', unique: true })
  accountId!: number;

  @OneToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ name: 'job_id', type: 'int', unique: true })
  jobId!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  name!: string | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId!: number | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 50, nullable: true })
  jobTitle!: string | null;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
    comment: '教职工状态：ACTIVE=在职，SUSPENDED=暂离（如休假、暂停教学），LEFT=已离职',
  })
  employmentStatus!: EmploymentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
