// src/modules/account/dto/account-detail.dto.ts
import { AccountStatus } from '@app-types/models/account.types';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { LoginHistoryItem } from '@src/adapters/graphql/account/enums/login-history.types';

/**
 * user_account 表数据传输对象
 */
@ObjectType({ description: '用户账户表数据传输对象' })
export class UserAccountDTO {
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
