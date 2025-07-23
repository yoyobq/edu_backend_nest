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
import { StudentStatus } from '../../../types/models/student.types';
import { AccountEntity } from './account.entity';

@ObjectType()
@Entity('member_students')
export class StudentEntity {
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

  @Field(() => Int, { description: '学生学号' })
  @Column({ name: 'stu_id', type: 'int', unique: true, comment: '学生ID' })
  stuId!: number;

  @Field(() => String, { nullable: true, description: '学生姓名' })
  @Column({ type: 'varchar', length: 50, nullable: true, comment: '学生姓名' })
  name!: string | null;

  @Field(() => Int, { nullable: true, description: '所属院系 ID' })
  @Column({ name: 'department_id', type: 'int', nullable: true, comment: '院系ID' })
  departmentId!: number | null;

  @Field(() => Int, { nullable: true, description: '所属班级 ID' })
  @Column({ name: 'class_id', type: 'int', nullable: true, comment: '班级ID' })
  classId!: number | null;

  @Field(() => Int, { nullable: true, description: '所属社团 ID' })
  @Column({ name: 'club_id', type: 'int', nullable: true, comment: '社团ID' })
  clubId!: number | null;

  @Field(() => String, { nullable: true, description: '备注信息' })
  @Column({ type: 'text', nullable: true, comment: '备注信息' })
  remarks!: string | null;

  @Field(() => StudentStatus, { description: '学生状态' })
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
