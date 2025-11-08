// src/adapters/graphql/account/dto/identity/coach.dto.ts

import { EmploymentStatus } from '@app-types/models/account.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * 教练身份信息 DTO
 */
@ObjectType({ description: '教练身份信息' })
export class CoachType {
  @Field(() => Int, { description: '教练 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID' })
  accountId!: number;

  @Field(() => String, { description: '教练姓名' })
  name!: string;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null;

  @Field(() => Int, { description: '教练等级（1/2/3）' })
  level!: number;

  @Field(() => String, { description: '教练简介/推介', nullable: true })
  description!: string | null;

  @Field(() => String, { description: '头像 URL', nullable: true })
  avatarUrl!: string | null;

  @Field(() => String, { description: '教练专长', nullable: true })
  specialty!: string | null;

  @Field(() => EmploymentStatus, { description: '就业状态' })
  employmentStatus!: EmploymentStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;

  @Field(() => Date, { description: '停用时间', nullable: true })
  deactivatedAt!: Date | null;
}
