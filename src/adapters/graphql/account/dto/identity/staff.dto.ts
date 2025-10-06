// src/adapters/graphql/account/dto/identity/staff.dto.ts

import { EmploymentStatus } from '@app-types/models/account.types';
import { Field, ObjectType } from '@nestjs/graphql';

/**
 * 员工身份信息 DTO
 */
@ObjectType({ description: '员工身份信息' })
export class StaffType {
  @Field(() => String, { description: '员工 ID，校园网工号' })
  id!: string;

  @Field(() => Number, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => String, { description: '员工姓名' })
  name!: string;

  @Field(() => Number, { description: '部门 ID', nullable: true })
  departmentId!: number | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null;

  @Field(() => String, { description: '职位名称', nullable: true })
  jobTitle!: string | null;

  @Field(() => EmploymentStatus, { description: '就业状态' })
  employmentStatus!: EmploymentStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
