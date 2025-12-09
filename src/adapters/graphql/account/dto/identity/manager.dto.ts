// src/adapters/graphql/account/dto/identity/manager.dto.ts

import { EmploymentStatus } from '@app-types/models/account.types';
import { UserState } from '@app-types/models/user-info.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { LoginHistoryItem } from '../../enums/login-history.types';

/**
 * 经理身份信息 DTO
 */
@ObjectType({ description: '经理身份信息' })
export class ManagerType {
  @Field(() => Int, { description: '经理 ID' })
  id!: number;

  @Field(() => Int, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => String, { description: '经理姓名' })
  name!: string;

  @Field(() => Int, { description: '部门 ID', nullable: true })
  departmentId!: number | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null;

  @Field(() => String, { description: '职位名称', nullable: true })
  jobTitle!: string | null;

  @Field(() => String, { description: '用户手机号（来自 user_info）', nullable: true })
  phone!: string | null;

  @Field(() => EmploymentStatus, { description: '就业状态' })
  employmentStatus!: EmploymentStatus;

  @Field(() => UserState, { description: '用户状态（来自 user_info）', nullable: true })
  userState!: UserState | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt!: Date | null;

  @Field(() => [LoginHistoryItem], { description: '最近登录历史（最多 5 条）', nullable: true })
  loginHistory!: LoginHistoryItem[] | null;
}

export type ManagerIdentityGraphType = ManagerType & { managerId: number };
