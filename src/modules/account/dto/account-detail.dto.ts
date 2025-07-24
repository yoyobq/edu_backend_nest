// src/modules/account/dto/account-detail.dto.ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { AccountStatus } from '../../../types/models/account.types';
import { LoginHistoryItem } from '../graphql/types/login-history.types';

/**
 * 账户详细信息响应对象（包含登录历史）
 */
@ObjectType()
export class AccountDetailResponse {
  @Field(() => ID, { description: '账户 ID' })
  id!: number;

  @Field(() => String, { description: '登录名', nullable: true })
  loginName!: string | null;

  @Field(() => String, { description: '登录邮箱', nullable: true })
  loginEmail!: string | null;

  @Field(() => AccountStatus, { description: '账户状态' })
  status!: AccountStatus;

  @Field(() => String, { description: '身份类型提示', nullable: true })
  identityHint!: string | null;

  @Field(() => [LoginHistoryItem], { description: '最近登录历史', nullable: true })
  recentLoginHistory!: LoginHistoryItem[] | null;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '更新时间' })
  updatedAt!: Date;
}
