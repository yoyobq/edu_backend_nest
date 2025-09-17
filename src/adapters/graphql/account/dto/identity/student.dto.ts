// src/adapters/graphql/account/dto/identity/student.dto.ts

import { StudentStatus } from '@app-types/models/student.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * 学生身份信息 DTO
 */
@ObjectType({ description: '学生身份信息' })
export class StudentType {
  @Field(() => ID, { description: '学生记录 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => Number, { description: '学生 ID' })
  stuId!: number;

  @Field(() => String, { description: '学生姓名' })
  name!: string;

  @Field(() => Number, { description: '院系 ID', nullable: true })
  departmentId!: number | null;

  @Field(() => Number, { description: '班级 ID', nullable: true })
  classId!: number | null;

  @Field(() => Number, { description: '社团 ID', nullable: true })
  clubId!: number | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remarks!: string | null;

  @Field(() => StudentStatus, { description: '学生状态' })
  studentStatus!: StudentStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
