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
import { StudentStatus } from '../../../types/models/student.types';
import { AccountEntity } from './account.entity';

@Entity('member_students')
export class StudentEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'account_id', type: 'int', unique: true })
  accountId!: number;

  @OneToOne(() => AccountEntity)
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ name: 'stu_id', type: 'int', unique: true, comment: '学生ID' })
  stuId!: number;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '学生姓名' })
  name!: string | null;

  @Column({ name: 'department_id', type: 'int', nullable: true, comment: '院系ID' })
  departmentId!: number | null;

  @Column({ name: 'class_id', type: 'int', nullable: true, comment: '班级ID' })
  classId!: number | null;

  @Column({ name: 'club_id', type: 'int', nullable: true, comment: '社团ID' })
  clubId!: number | null;

  @Column({ type: 'text', nullable: true, comment: '备注信息' })
  remarks!: string | null;

  @Column({
    name: 'student_status',
    type: 'enum',
    enum: StudentStatus,
    default: StudentStatus.ENROLLED,
    comment: '学生状态：ENROLLED=在读，SUSPENDED=暂离（休学/参军），GRADUATED=已毕业，DROPPED=退学',
  })
  studentStatus!: StudentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', comment: '更新时间' })
  updatedAt!: Date;
}
