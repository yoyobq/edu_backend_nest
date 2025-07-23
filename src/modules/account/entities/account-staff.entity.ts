import { Field, ID, ObjectType, Int } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentStatus } from '../../../types/models/staff.types';
import { AccountEntity } from './account.entity';

@ObjectType()
@Entity('member_staff')
export class StaffEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => Int, { description: '关联账号 ID' })
  @Column({ name: 'account_id', type: 'int', unique: true })
  accountId!: number;

  @Field(() => AccountEntity, { description: '关联账号信息' })
  @ManyToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Field(() => Int, { description: '员工工号' })
  @Column({ name: 'job_id', type: 'int', unique: true })
  jobId!: number;

  @Field(() => String, { nullable: true, description: '员工姓名' })
  @Column({ type: 'varchar', length: 50, nullable: true })
  name!: string | null;

  @Field(() => Int, { nullable: true, description: '所属部门 ID' })
  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId!: number | null;

  @Field(() => String, { nullable: true, description: '备注信息' })
  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Field(() => String, { nullable: true, description: '职位名称' })
  @Column({ name: 'job_title', type: 'varchar', length: 50, nullable: true })
  jobTitle!: string | null;

  @Field(() => EmploymentStatus, { description: '在职状态' })
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
