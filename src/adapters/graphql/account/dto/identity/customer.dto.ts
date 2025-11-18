// src/adapters/graphql/account/dto/identity/customer.dto.ts
import { UserState } from '@app-types/models/user-info.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { LoginHistoryItem } from '../../enums/login-history.types';
import { MembershipLevelType } from './membership-level.dto';

/**
 * 客户身份信息 DTO
 */
@ObjectType({ description: '客户身份信息' })
export class CustomerType {
  @Field(() => Int, { description: '客户 ID' })
  id!: number;

  @Field(() => Number, { description: '关联的账户 ID', nullable: true })
  accountId!: number | null;

  @Field(() => String, { description: '客户姓名' })
  name!: string;

  @Field(() => String, { description: '备用联系电话', nullable: true })
  contactPhone!: string | null;

  @Field(() => String, { description: '联络偏好时间', nullable: true })
  preferredContactTime!: string | null;

  @Field(() => Int, { description: '会员等级 ID', nullable: true })
  membershipLevel!: number | null;

  @Field(() => MembershipLevelType, {
    description: '会员等级详信息（按 membershipLevelId 解析）',
    nullable: true,
  })
  membershipLevelInfo?: MembershipLevelType | null;

  @Field(() => String, { description: '备注信息', nullable: true })
  remark!: string | null; // 修正：从 remarks 改为 remark，与实体字段名保持一致

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
