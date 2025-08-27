// src/modules/account/identities/school/student/account-student.entity.ts

import { StudentStatus } from '@app-types/models/student.types';
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

/**
 * 学生实体
 * 对应数据库表：member_students
 * 用于存储学生的基本信息和状态
 */
@Entity('member_students')
export class StudentEntity {
  /**
   * 学生记录 ID，主键
   * 自增整型主键
   */
  @PrimaryGeneratedColumn({ type: 'int', comment: '主键' })
  id!: number;

  /**
   * 关联的账户 ID
   * 与 base_user_accounts 表的外键关联，具有唯一约束
   */
  @Column({
    name: 'account_id',
    type: 'int',
    unique: true,
    comment: 'user_accounts.id',
  })
  accountId!: number;

  /**
   * 关联的账户实体
   * 一对一关系，通过 account_id 字段关联
   */
  @OneToOne(() => AccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  /**
   * 学生 ID
   * 学生的唯一标识符，具有唯一约束
   */
  @Column({
    name: 'stu_id',
    type: 'int',
    unique: true,
    comment: '学生ID',
  })
  stuId!: number;

  /**
   * 学生姓名
   * 可为空，最大长度 50 个字符
   */
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '学生姓名',
  })
  name!: string | null;

  /**
   * 院系 ID
   * 可为空，用于标识学生所属院系
   */
  @Column({
    name: 'department_id',
    type: 'int',
    nullable: true,
    comment: '院系ID',
  })
  departmentId!: number | null;

  /**
   * 班级 ID
   * 可为空，用于标识学生所属班级
   */
  @Column({
    name: 'class_id',
    type: 'int',
    nullable: true,
    comment: '班级ID',
  })
  classId!: number | null;

  /**
   * 社团 ID
   * 可为空，用于标识学生参加的社团
   */
  @Column({
    name: 'club_id',
    type: 'int',
    nullable: true,
    comment: '社团ID',
  })
  clubId!: number | null;

  /**
   * 备注信息
   * 可为空的文本字段，用于存储额外的备注信息
   */
  @Column({
    type: 'text',
    nullable: true,
    comment: '备注信息',
  })
  remarks!: string | null;

  /**
   * 学生状态
   * 枚举类型，包含：ENROLLED（在读）、SUSPENDED（暂离）、GRADUATED（已毕业）、DROPPED（退学）
   * 默认值为 ENROLLED
   */
  @Column({
    name: 'student_status',
    type: 'enum',
    enum: StudentStatus,
    default: StudentStatus.ENROLLED,
    comment: '学生状态：ENROLLED=在读，SUSPENDED=暂离（休学/参军），GRADUATED=已毕业，DROPPED=退学',
  })
  studentStatus!: StudentStatus;

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
}
